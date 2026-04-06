const https = require('https');

const options = {
  hostname: 'sportapi7.p.rapidapi.com',
  path: '/api/v1/sport/football/scheduled-events/2026-04-05',
  headers: {
    'x-rapidapi-key': 'ae0215ddf5msh17b2fb1e99eeb41p1afb26jsn3d1266207e91',
    'x-rapidapi-host': 'sportapi7.p.rapidapi.com'
  }
};

https.get(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    try {
      const data = JSON.parse(body);
      if (data.events && data.events.length > 0) {
        console.log("FINAL_JSON:", JSON.stringify(data.events[0], null, 2));
      } else {
        console.log("NO_EVENTS_FOUND");
      }
    } catch (e) {
      console.log("PARSE_ERROR:", e.message);
    }
  });
}).on('error', (e) => {
  console.error("HTTP_ERROR:", e.message);
});
