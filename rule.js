"use strict";

module.exports.truncateName = function truncateName(name) {
    if (name.length > 255) {
        return name.slice(0, 255 - 3) + "...";
    }
    return name;
};

module.exports.oneOf = function oneOf(...rules) {
    let self = function(ctx) {
        for (let rule of rules) {
            let state = rule(ctx);
            if (typeof state !== "undefined") {
                return state;
            }
        }
        return self;
    };
    return self;
};

module.exports.pattern = function pattern(re, handler) {
    return function(ctx) {
        if (typeof re === "string") {
            if (ctx.line === re) {
                return handler(ctx);
            }
        } else {
            let match = re.exec(ctx.line);
            if (match !== null) {
                ctx.match = match;
                return handler(ctx);
            }
        }
    };
};

module.exports.eof = function eof(handler) {
    return function(ctx) {
        if (ctx.eol === "" && ctx.line === "") {
            return handler(ctx);
        }
    };
};

module.exports.blocks = function blocks(first, middle, last, build) {
    let state;
    let self = function(ctx) {
        if (typeof state === "undefined") {
            state = first(ctx);
            return self;
        }
        if (ctx.eol === "" && ctx.line === "") {
            ctx.emit(build(ctx, state));
            state = undefined;
            return self;
        }
        let next = first(ctx);
        if (typeof next !== "undefined") {
            ctx.emit(build(ctx, state));
            state = next;
            return self;
        }
        next = last(ctx, state);
        if (typeof next !== "undefined") {
            return (ctx) => {
                ctx.emit(build(ctx, state));
                state = undefined;
                return self(ctx);
            };
        }
        next = middle(ctx, state);
        if (typeof next !== "undefined") {
            state = next;
            return self;
        }
        ctx.emit(build(ctx, state));
        state = undefined;
        return self;
    };
    return self;
};
