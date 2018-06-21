"use strict";

const util = require("util");

class Node {
    constructor(matcher, next) {
        this.matcher = matcher;
        this.greedy = null;
        this.prehooks = [];
        this.next = next;
        this._visited = Symbol();
    }
}

class Block {
    constructor(root, leaves) {
        this.root = root;
        this.leaves = leaves;
    }
}

function connect(block, node) {
    for (let n of block.leaves) {
        n.next.push(node);
    }
}

function simple(matcher) {
    let node = new Node(matcher, []);
    return new Block(node, [node]);
}

function prehook(fn) {
    let node = new Node(null, []);
    node.prehooks.push(fn);
    return new Block(node, [node]);
}

module.exports.sequence = function sequence(...blocks) {
    if (blocks.length < 1) {
        throw new Error("sequence should have at least one element");
    }
    if (blocks.length === 1) {
        return blocks[0];
    }
    for (let i = 0; i < blocks.length - 1; i++) {
        connect(blocks[i], blocks[i + 1].root);
    }
    return new Block(blocks[0].root, blocks[blocks.length - 1].leaves);
};

module.exports.alternate = function alternate(...blocks) {
    let node = new Node(null, blocks.map((x) => x.root));
    return new Block(node, Array.prototype.concat.apply([], blocks.map((x) => x.leaves)));
};

module.exports.optional = function optional(...blocks) {
    let block = module.exports.sequence(...blocks);
    let node = new Node(null, [block.root]);
    return new Block(node, [node].concat(block.leaves));
};

module.exports.zeroOrMore = function zeroOrMore(...blocks) {
    let block = module.exports.sequence(...blocks);
    let node = new Node(null, [block.root]);
    connect(block, node);
    return new Block(node, [node].concat(block.leaves));
};

function lazy(block) {
    let start = new Node(null, [block.root]);
    start.greedy = false;
    let finish = new Node(null, []);
    finish.greedy = true;
    connect(block, finish);
    return new Block(start, [finish]);
}

module.exports.oneOrMore = function oneOrMore(...blocks) {
    let block = module.exports.sequence(...blocks);
    let node = new Node(null, [block.root]);
    connect(block, node);
    return new Block(node, block.leaves);
};

function finalize(block) {
    return module.exports.sequence(block, simple(null));
}

function _inspectableMatcher(name, args, fn) {
    fn[util.inspect.custom] = function(depth, options) {
        if (depth < 0) {
            return options.stylize("[Matcher]", "special");
        }

        const newOptions = Object.assign({}, options, {
            depth: options.depth === null ? null : options.depth - 1
        });

        const padding = " ".repeat(name.length + 1);
        const inner = Array.prototype.map.call(args, (x) => util.inspect(x, newOptions).replace(/\n/g, `\n${padding}`)).join(", ");
        return `${options.stylize(name, "name")}(${inner})`;
    };
    return fn;
}

module.exports.anything = function anything() {
    let matcher = _inspectableMatcher("anything", arguments, (ctx, captured) => {
        return true;
    });
    return simple(matcher);
};

module.exports.pattern = function pattern(re) {
    let matcher = _inspectableMatcher("pattern", arguments, (ctx, captured) => {
        const match = re.exec(ctx.line);
        if (match === null) {
            return false;
        }
        if (typeof match.groups !== "undefined") {
            for (let key of Object.keys(match.groups)) {
                if (typeof captured[key] === "undefined") {
                    captured[key] = "";
                } else {
                    captured[key] += "\n";
                }
                captured[key] += match.groups[key];
            }
        }
        return true;
    });
    return simple(matcher);
};

class State {
    constructor(node, captured, greedy, prehooks) {
        this.matcher = node.matcher;
        this.greedy = greedy;
        this.prehooks = prehooks;
        this.next = node.next;
        this.captured = Object.assign({}, captured);
    }
}

function _addState(list, node, captured, visitor, greedy, prehooks) {
    if (node._visited == visitor) {
        return;
    }
    node._visited = visitor;

    if (node.greedy !== null) {
        greedy = node.greedy;
    }

    if (node.matcher === null) {
        if (node.next.length === 0) {
            list.push(new State(node, captured, greedy, prehooks));
        } else for (let next of node.next) {
            _addState(list, next, captured, visitor, greedy, prehooks.concat(next.prehooks));
        }
    } else {
        list.push(new State(node, captured, greedy, prehooks));
    }
}

module.exports.initialize = function initialize(graph, captured) {
    let states = [];
    _addState(states, graph.root, captured, Symbol(), true, []);
    return states;
};

module.exports.execute = function execute(states, ctx) {
    const visitor = Symbol(); // it should be the same within this function
    let result = [];
    states = states.filter(x => x.greedy !== false).concat(states.filter(x => x.greedy === false));
    for (let state of states) {
        if (state.matcher !== null) {
            for (let hook of state.prehooks) {
                hook(ctx, state.captured);
            }
            if (state.matcher(ctx, state.captured)) {
                for (let next of state.next) {
                    _addState(result, next, state.captured, visitor, state.greedy, next.prehooks);
                }
            }
        }
    }
    return result;
};

module.exports.search = function search(graph, initial) {
    graph = finalize(
        module.exports.sequence(
            lazy(module.exports.zeroOrMore(
                module.exports.anything()
            )),
            prehook((ctx, captured) => {
                captured._offset = ctx.offset;
            }),
            graph
        )
    );

    const binarySearchSegment = (arr, v) => {
        let i = 0, j = arr.length; // arr[i - 1].offset < v, arr[j].offset >= v
        while (i != j) {
            let p = i + ((j - i)/2|0);
            if (arr[p].offset < v) {
                i = p + 1;
            } else {
                j = p;
            }
        }
        return i;
    };

    let deferred = [];
    const defer = (seg) => {
        const i = binarySearchSegment(deferred, seg.offset);
        if (i == deferred.length || deferred[i].offset != seg.offset) {
            deferred.splice(i, 0, seg);
        } else {
            deferred[i] = seg;
        }
    };

    const flush = (ctx, deferred, states) => {
        while (deferred.length !== 0) {
            const d = deferred[0];
            let found = false;
            for (let state of states) {
                if (state.matcher !== null && typeof state.captured._offset !== "undefined" && state.captured._offset <= d.offset) {
                    found = true;
                    break;
                }
            }
            if (found) {
                break;
            }
            ctx.emit(d);
            const end = d.offset + d.length;
            const i = binarySearchSegment(deferred, end);
            deferred.splice(0, i);
        }
    };

    const segment = (match, end) => {
        const offset = match._offset;
        delete match._offset;
        return {
            offset: offset,
            length: end - offset,
            metadata: match,
        };
    };

    let states = module.exports.initialize(graph, initial);
    const self = (ctx) => {
        for (let state of states) {
            if (state.matcher === null) {
                defer(segment(state.captured, ctx.offset));
            }
        }
        flush(ctx, deferred, states);
        if (ctx.eol === "" && ctx.line === "") {
            flush(ctx, deferred, []);
        } else {
            states = module.exports.execute(states, ctx);
        }
        return self;
    };
    return self;
};
