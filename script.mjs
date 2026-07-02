import https from 'https';

https.get('https://raw.githubusercontent.com/Makeblock-official/Makeblock-Libraries/master/examples/Firmware_for_mBlock/mbot_firmware/mbot_firmware.ino', res => {
    let d = '';
    res.on('data', c => d+=c);
    res.on('end', () => console.log(d.length > 0 ? d.substring(2000, 3000) : "empty"));
});

