import express from "express";
import { pool } from "./db";
import { costToBuy, getPrices } from "./lmsr";
import { Market } from "./market";

const app = express();
app.use(express.json());

app.post("/market", async (req, res) => {
  const { question, b } = req.body;
  const result = await pool.query(
    "INSERT INTO markets (question, b) VALUES ($1, $2) RETURNING *",
    [question, b || 100]
  );
  res.json(result.rows[0]);
});

app.get("/market/:id", async (req, res) => {
  const result = await pool.query("SELECT * FROM markets WHERE id=$1", [req.params.id]);
  const market: Market = result.rows[0];
  const prices = getPrices({
    id: market.id,
    question: market.question,
    q_yes: market.q_yes,
    q_no: market.q_no,
    b: market.b,
  });
  res.json({ ...market, prices });
});

app.post("/trade", async (req, res) => {
  const { marketId, outcome, delta } = req.body;
  const result = await pool.query("SELECT * FROM markets WHERE id=$1", [marketId]);
  const market = result.rows[0];

  const cost = costToBuy(
    {
      id: market.id,
      question: market.question,
      q_yes: market.q_yes,
      q_no: market.q_no,
      b: market.b,
    },
    outcome,
    delta
  );

  if (outcome === "yes") market.q_yes += delta;
  else market.qno += delta;

  await pool.query("UPDATE markets SET q_yes=$1, q_no=$2 WHERE id=$3", [
    market.q_yes,
    market.qno,
    market.id,
  ]);

  await pool.query(
    "INSERT INTO trades (market_id, outcome, delta, cost) VALUES ($1, $2, $3, $4)",
    [market.id, outcome, delta, cost]
  );

  res.json({ cost, newPrices: getPrices(market) });
});

app.listen(process.env.PORT || 4000, () =>
  console.log(`Server running on port ${process.env.PORT || 4000}`)
);
