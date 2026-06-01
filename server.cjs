require("./server-runtime.cjs");

app.get('/', (req, res) => {
  res.send('Termer is running.');
});
