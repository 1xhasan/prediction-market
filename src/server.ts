import express from "express";
import { pool } from "./db";
import { costToBuy, getPrices } from "./lmsr";
import { Market } from "./market";
import { hasUncaughtExceptionCaptureCallback } from "process";
import { Message } from "@solana/web3.js";

const app = express();
app.use(express.json());


app.post("/user/signin", async (req, res) => {


  try {
  const {username, password} = req.body;
  const result = await pool.query("SELECT * FROM users WHERE username = $1 AND password=$2",[username, password]);

  if(result.rows.length>0) {
    res.status(200).json({message: "Something went wrong"});
  } else {
    res.status(401).json({Message: "Username or password is incorrect"});
  }


  }catch(err) {
    console.log(err);
    res.status(500).json({Message : "Something went wrong"});
  }

});

app.post("/user/signup", async (req, res) => {


 try {
  const {username, email, password} = req.body;
  await pool.query( 
    "INSERT INTO users (username, email, password) VALUES ($1, $2, $3)",
    [username, email, password]
  );

  return res.json({Message : "User inserted successfully"});

 } catch(err) {
  console.log(err);
  res.status(500).json({Message : "Something went wrong"});
 }

});



app.post("admin/result" , async (require, resp) => {

});

app.post("/user/merge", async (req, res) => {

});

app.post("/user/split", async (req, res) => {

});

app.post("/user/claim", async (req, res) => {

});

app.post("/user/onramp", async (req, res) => {

});


app.post("admin/market", async (req, res) => {
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
