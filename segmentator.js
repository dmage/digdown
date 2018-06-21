"use strict";

const segment = require("./segment");
const machine = require("./machine");

function segmentToString(seg) {
    return `{offset: ${seg.offset}, length: ${seg.length}, metadata: ${JSON.stringify(seg.metadata)}}`;
}

module.exports.segmentateRange = function segmentateRange(filename, parentOffset, offset, length, machines, defaultSegmentator, callback) {
    if (machines.length === 0) {
        setImmediate(function() {
            callback(null, []);
        });
        return;
    }
    const init = machines[0];
    const stream = segment.open(filename, parentOffset + offset, length);
    machine.run(stream, init(), (err, data) => {
        if (err) {
            callback(err);
            return;
        }
        for (let s of data) {
            s.offset += offset;
        }

        for (let i = 0; i < data.length; i++) {
            if (data[i].offset < offset || data[i].offset >= offset + length) {
                throw new Error(`segmentate range (base=${parentOffset}, offset=${offset}, length=${length}): data[${i}] = ${segmentToString(data[i])}; offset is out of range [${offset}, ${offset + length - 1}]`);
            }
            if (data[i].length < 0 || data[i].length > offset + length - data[i].offset) {
                throw new Error(`segmentate range (base=${parentOffset}, offset=${offset}, length=${length}): data[${i}] = ${segmentToString(data[i])}; length is out of range [0, ${offset + length - data[i].offset}]`);
            }
        }

        let result = [];
        const handleGap = (i) => {
            let gapBegin = (i === 0 ? offset : data[i - 1].offset + data[i - 1].length),
                gapEnd = (i === data.length ? offset + length : data[i].offset);
            if (gapBegin === gapEnd) {
                setImmediate(function() {
                    handleSeg(i);
                });
                return;
            }
            module.exports.segmentateRange(filename, parentOffset, gapBegin, gapEnd - gapBegin, machines.slice(1), defaultSegmentator, (err, data) => {
                if (err) {
                    callback(err);
                    return;
                }
                result = result.concat(data);
                handleSeg(i);
            });
        };
        const handleSeg = (i) => {
            if (i >= data.length) {
                callback(null, result);
                return;
            }
            defaultSegmentator(filename, parentOffset, data[i], defaultSegmentator, (err) => {
                if (err) {
                    callback(err);
                    return;
                }
                result.push(data[i]);
                handleGap(i + 1);
            });
        };
        handleGap(0);
    });
};

module.exports.noop = function noop() {
    return (filename, parentOffset, seg, defaultSegmentator, callback) => {
        callback(null);
    };
};

module.exports.basic = function basic(...machines) {
    return (filename, parentOffset, seg, defaultSegmentator, callback) => {
        module.exports.segmentateRange(filename, parentOffset + seg.offset, 0, seg.length, machines, defaultSegmentator, (err, data) => {
            if (err) {
                callback(err);
                return;
            }
            seg.segments = data;
            callback(null);
        });
    };
};

module.exports.recursive = function recursive(segmentator) {
    return (filename, parentOffset, seg, defaultSegmentator, callback) => {
        segmentator(filename, parentOffset, seg, segmentator, callback);
    };
};

module.exports.byType = function byType(segmentators) {
    return (filename, parentOffset, seg, defaultSegmentator, callback) => {
        const segmentator = segmentators[seg.metadata.type];
        if (!segmentator) {
            callback(null);
            return;
        }
        segmentator(filename, parentOffset, seg, defaultSegmentator, callback);
    };
};

module.exports.filter = function filter(filter, segmentator) {
    return (filename, parentOffset, seg, defaultSegmentator, callback) => {
        segmentator(filename, parentOffset, seg, defaultSegmentator, (err) => {
            if (err) {
                callback(err);
                return;
            }
            if (typeof seg.segments !== "undefined") {
                seg.segments = seg.segments.filter(filter);
            }
            callback(err);
        });
    };
};

module.exports.collapseSuccessfulSiblings = function collapseSuccessfulSiblings(minBlocks, segmentator) {
    return (filename, parentOffset, seg, defaultSegmentator, callback) => {
        segmentator(filename, parentOffset, seg, defaultSegmentator, (err) => {
            if (err) {
                callback(err);
                return;
            }

            if (typeof seg.segments === "undefined") {
                callback(null);
                return;
            }

            if (!seg.segments.some((s) => s.metadata.status === "failure")) {
                callback(null);
                return;
            }

            let collapse = (buf) => {
                if (buf.length <= 1) {
                    return buf;
                }
                let c = 1, bytes = 0;
                for (let i = 1; i < buf.length; i++) {
                    if (buf[i - 1].offset + buf[i - 1].length < buf[i].offset) {
                        c++;
                        bytes += buf[i].offset - buf[i - 1].offset - buf[i - 1].length;
                    }
                    c++;
                }
                if (c < minBlocks) {
                    return buf;
                }
                const base = buf[0].offset;
                for (let s of buf) {
                    s.offset -= base;
                }
                return [
                    {
                        offset: base,
                        length: buf[buf.length - 1].offset + buf[buf.length - 1].length,
                        metadata: {
                            name: `${buf.length} blocks, ${c - buf.length} gaps with ${bytes} bytes`,
                        },
                        segments: buf,
                    },
                ];
            };

            let buf = [];
            let result = [];
            for (let s of seg.segments) {
                if (s.metadata.status !== "failure") {
                    buf.push(s);
                } else {
                    result = result.concat(collapse(buf));
                    result.push(s);
                    buf = [];
                }
            }
            result = result.concat(collapse(buf));

            seg.segments = result;
            callback(null);
        });
    };
};
