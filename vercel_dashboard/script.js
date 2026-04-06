const metrics = {
  temp: ["25.6 C", "26.1 C", "24.9 C", "27.0 C"],
  humidity: ["61.2 %", "59.8 %", "62.4 %", "60.1 %"],
  meter: ["548.7 kWh", "552.3 kWh", "560.9 kWh", "570.2 kWh"],
  door: ["Open", "Closed"],
  motion: ["No Motion", "Motion Detected"]
};

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function updateCards() {
  document.getElementById("temp").textContent = randomItem(metrics.temp);
  document.getElementById("humidity").textContent = randomItem(metrics.humidity);
  document.getElementById("meter").textContent = randomItem(metrics.meter);
  document.getElementById("door").textContent = randomItem(metrics.door);
  document.getElementById("motion").textContent = randomItem(metrics.motion);
}

setInterval(updateCards, 4000);