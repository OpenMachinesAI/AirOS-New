async function test() {
    const res = await fetch("http://localhost:3000/api/tts?text=Hello");
    console.log("Status:", res.status);
    console.log("Content-Type:", res.headers.get("content-type"));
    const buff = await res.arrayBuffer();
    console.log("Size:", buff.byteLength);
}
test();
