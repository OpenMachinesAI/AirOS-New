const http = require('http');

async function test() {
    const res = await fetch("http://localhost:3000/api/tts?text=test");
    console.log("Status:", res.status);
    console.log("Content-Type:", res.headers.get("content-type"));
    const buff = await res.arrayBuffer();
    console.log("Size:", buff.byteLength);
    console.log("Data snippet (first 100):", Buffer.from(buff).toString('hex', 0, 100));
}
test();
