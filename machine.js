"use strict";

module.exports.run = function run(stream, handler, callback) {
	let state = handler, result = [], ctx = {
		offset: 0,
		line: "",
		eol: "",
		emit: function(seg) {
			if (typeof seg.offset !== "number") {
				throw new Error("offset should be a number, got " + seg.offset);
			}
			if (typeof seg.length !== "number") {
				throw new Error("length should be a number, got " + seg.length);
			}
			if (seg.offset < 0) {
				throw new Error(seg);
			}
			if (seg.length < 0) {
				throw new Error(seg);
			}
			if (result.length > 0) {
				const prev = result[result.length - 1];
				if (seg.offset < prev.offset + prev.length) {
					throw new Error("segments overlap: " + prev.offset + "+" + prev.length + " " + seg.offset);
				}
			}
			result.push(seg);
		},
	};

	let offset = 0, accumulated = Buffer.alloc(0);
	stream
		.on("data", function(data) {
			if (accumulated.length !== 0) {
				data = Buffer.concat([accumulated, data]);
			}
			let len = data.length, begin = 0, end, eol;
			while (begin < len) {
				const lf = data.indexOf(0x0a, begin);
				if (lf !== -1) {
					if (lf > 0 && data[lf - 1] == 0x0d) {
						end = lf - 1;
						eol = "\r\n";
					} else {
						end = lf;
						eol = "\n";
					}
				} else {
					break;
				}

				ctx.offset = offset;
				ctx.line = data.slice(begin, end).toString("utf8");
				ctx.eol = eol;
				state = state(ctx);

				offset += end + eol.length - begin;
				begin = end + eol.length;
			}
			accumulated = data.slice(begin);
		})
		.on("end", function() {
			if (accumulated.length !== 0) {
				ctx.offset = offset;
				ctx.line = accumulated.toString("utf8");
				ctx.eol = "";
				state = state(ctx);

				offset += accumulated.length;
			}

			ctx.offset = offset;
			ctx.line = "";
			ctx.eol = "";
			state = state(ctx);

			callback(null, result);
		});
};
