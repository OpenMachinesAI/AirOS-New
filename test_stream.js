async function run() {
    const res = await fetch("https://api.flowery.pw/v1/tts?text=test&voice=546967cf-bcd9-5ff0-af5a-464cbf65a8f7");
    try {
        let count = 0;
        for await (const chunk of res.body) {
            count++;
        }
        console.log("Chunks:", count);
    } catch(e) {
        console.error("Error async iterable:", e);
    }
}
run();
