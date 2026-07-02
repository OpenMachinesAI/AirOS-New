import ytSearch from 'yt-search';
ytSearch('lofi').then(r => console.log(r.videos[0].videoId)).catch(console.error);
