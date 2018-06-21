const assert = require("assert");
const regular = require("../regular");

function run(graph, lines) {
    let result = [];
    const emit = segment => {
        result.push(segment);
    };
    let offset = 0;
    let state = regular.search(graph);
    for (let line of lines) {
        state = state({
            offset: offset,
            line: line,
            eol: "\n",
            emit: emit,
        });
        offset += line.length + 1;
    }
    state = state({
        offset: offset,
        line: "",
        eol: "",
        emit: emit,
    });
    return result;
}

describe("regular.search", function() {
    describe("with pattern /ab(abc|de)/", function() {
        beforeEach(function() {
            this.graph = regular.sequence(
                regular.pattern(/^(?<a>a)/),
                regular.pattern(/^(?<b>b)/),
                regular.zeroOrMore(
                    regular.alternate(
                        regular.sequence(
                            regular.pattern(/^(?<x_a>a)/),
                            regular.pattern(/^(?<x_b>b)/),
                            regular.pattern(/^(?<x_c>c)/),
                        ),
                        regular.sequence(
                            regular.pattern(/^(?<x_d>d)/),
                            regular.pattern(/^(?<x_e>e)/),
                        ),
                    ),
                ),
            );
        });
        it("should generate 'ababc' and 'abde' on 'ababcabde'", function() {
            let result = run(this.graph, ["a", "b", "a", "b", "c", "a", "b", "d", "e"]);
            assert.deepEqual(result, [
                { offset: 0, length: 10, metadata: { a: 'a', b: 'b', x_a: 'a', x_b: 'b', x_c: 'c' } },
                { offset: 10, length: 8, metadata: { a: 'a', b: 'b', x_d: 'd', x_e: 'e' } },
            ]);
        });
    });
    describe("with pattern /ab((x|y)ab(x|y)abyz)?/", function() {
        beforeEach(function() {
            this.graph = regular.sequence(
                regular.pattern(/^(?<a>a)/),
                regular.pattern(/^(?<b>b)/),
                regular.optional(
                    regular.alternate(
                        regular.pattern(/^(?<x_1x>x)/),
                        regular.sequence(
                            regular.pattern(/^(?<x_1y>y)/),
                            regular.pattern(/^(?<x_1z>z)/),
                        ),
                    ),
                    regular.pattern(/^(?<x_1a>a)/),
                    regular.pattern(/^(?<x_1b>b)/),
                    regular.alternate(
                        regular.pattern(/^(?<x_2x>x)/),
                        regular.pattern(/^(?<x_2y>y)/),
                    ),
                    regular.pattern(/^(?<x_3a>a)/),
                    regular.pattern(/^(?<x_3b>b)/),
                    regular.pattern(/^(?<x_3y>y)/),
                    regular.pattern(/^(?<x_3z>z)/),
                ),
            );
        });
        it("should generate 'ab' and 'abxabxabyz' on 'abxabxabxabyz'", function() {
            let result = run(this.graph, ["a", "b", "x", "a", "b", "x", "a", "b", "x", "a", "b", "y", "z"]);
            assert.deepEqual(result, [
                { offset: 0, length: 4, metadata: { a: 'a', b: 'b' } },
                { offset: 6, length: 20, metadata: { a: 'a', b: 'b', x_1a: "a", x_1b: "b", x_1x: "x", x_2x: "x", x_3a: "a", x_3b: "b", x_3y: "y", x_3z: "z" } },
            ]);
        });
        it("should generate 3 times 'ab' on 'abxabxab'", function() {
            let result = run(this.graph, ["a", "b", "x", "a", "b", "x", "a", "b"]);
            assert.deepEqual(result, [
                { offset: 0, length: 4, metadata: { a: 'a', b: 'b' } },
                { offset: 6, length: 4, metadata: { a: 'a', b: 'b' } },
                { offset: 12, length: 4, metadata: { a: 'a', b: 'b' } },
            ]);
        });
        it("should generate 3 times 'ab' on 'abxabxabx'", function() {
            let result = run(this.graph, ["a", "b", "x", "a", "b", "x", "a", "b", "x"]);
            assert.deepEqual(result, [
                { offset: 0, length: 4, metadata: { a: 'a', b: 'b' } },
                { offset: 6, length: 4, metadata: { a: 'a', b: 'b' } },
                { offset: 12, length: 4, metadata: { a: 'a', b: 'b' } },
            ]);
        });
        it("should generate 3 times 'ab' on 'abxabxaby'", function() {
            let result = run(this.graph, ["a", "b", "x", "a", "b", "x", "a", "b", "y"]);
            assert.deepEqual(result, [
                { offset: 0, length: 4, metadata: { a: 'a', b: 'b' } },
                { offset: 6, length: 4, metadata: { a: 'a', b: 'b' } },
                { offset: 12, length: 4, metadata: { a: 'a', b: 'b' } },
            ]);
        });
        it("should generate 3 times 'ab' on 'abxabxabyx'", function() {
            let result = run(this.graph, ["a", "b", "x", "a", "b", "x", "a", "b", "y", "x"]);
            assert.deepEqual(result, [
                { offset: 0, length: 4, metadata: { a: 'a', b: 'b' } },
                { offset: 6, length: 4, metadata: { a: 'a', b: 'b' } },
                { offset: 12, length: 4, metadata: { a: 'a', b: 'b' } },
            ]);
        });
    });
    describe("with pattern /a(bacac|c)/", function() {
        beforeEach(function() {
            this.graph = regular.sequence(
                regular.pattern(/^(?<a>a)/),
                regular.alternate(
                    regular.sequence(
                        regular.pattern(/^(?<x_1b>b)/),
                        regular.pattern(/^(?<x_2a>a)/),
                        regular.pattern(/^(?<x_2c>c)/),
                        regular.pattern(/^(?<x_3a>a)/),
                        regular.pattern(/^(?<x_3c>c)/),
                    ),
                    regular.pattern(/^(?<y_c>c)/),
                ),
            );
        });
        it("should generate 'abacac' on 'abacac'", function() {
            let result = run(this.graph, ["a", "b", "a", "c", "a", "c"]);
            assert.deepEqual(result, [
                { offset: 0, length: 12, metadata: { a: 'a', x_1b: 'b', x_2a: 'a', x_2c: 'c', x_3a: 'a', x_3c: 'c' } },
            ]);
        });
        it("should generate 'ac' and 'abacac' on 'abacabacac'", function() {
            let result = run(this.graph, ["a", "b", "a", "c", "a", "b", "a", "c", "a", "c"]);
            assert.deepEqual(result, [
                { offset: 4, length: 4, metadata: { a: 'a', y_c: 'c' } },
                { offset: 8, length: 12, metadata: { a: 'a', x_1b: 'b', x_2a: 'a', x_2c: 'c', x_3a: 'a', x_3c: 'c' } },
            ]);
        });
    });
});
