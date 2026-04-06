const apiKey = "1933ec48aae4c6fd8b5794cd9a576df4";
const date = "2026-04-06";
const url = `https://v3.football.api-sports.io/odds?date=${date}`;

console.log(`Checking Odds for ${date}...`);

fetch(url, {
  headers: { "x-apisports-key": apiKey }
})
.then(res => res.json())
.then(json => {
  console.log("Status:", json.results > 0 ? "SUCCESS" : "EMPTY");
  console.log("Results count:", json.results);
  if (json.results > 0) {
    console.log("Sample Match:", json.response[0].fixture.id);
    console.log("Sample Odds:", JSON.stringify(json.response[0].bookmakers[0].bets[0]));
  } else {
      console.log("Full Response:", JSON.stringify(json));
  }
})
.catch(err => console.error("Error:", err));
