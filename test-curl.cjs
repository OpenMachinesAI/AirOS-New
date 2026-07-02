const http = require('http');
http.get('http://localhost:3000/api/youtube/search?q=lofi', res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => console.log(data));
});
