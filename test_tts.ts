async function test() {
    const text = "Hello world";
    const voiceId = "546967cf-bcd9-5ff0-af5a-464cbf65a8f7";
    const floweryUrl = `https://api.flowery.pw/v1/tts?text=${encodeURIComponent(text)}&voice=${voiceId}`;
    
    try {
        const floweryRes = await fetch(floweryUrl, {
            method: 'GET',
            headers: { 
                'Accept': 'audio/mpeg',
                'User-Agent': 'AirowBot/1.0 (https://airow.example.com)'
            }
        });
        const contentType = floweryRes.headers.get('content-type');
        console.log("Status:", floweryRes.status);
        console.log("Content-Type:", contentType);
        const buffer = await floweryRes.arrayBuffer();
        console.log("Size:", buffer.byteLength);
        console.log("Starts with JSON?:", new TextDecoder().decode(buffer.slice(0, 100)));
    } catch(e) {
        console.error(e);
    }
}
test();
