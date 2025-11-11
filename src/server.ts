import express from "express";
import { pool } from "./db";
import { costToBuy, getPrices } from "./services/lmsr"
import { Market } from "./models/market";
import { hasUncaughtExceptionCaptureCallback } from "process";
import { Message } from "@solana/web3.js";
import { Client } from "pg";
import { initDB } from "./config/dbInit";
import { error } from "console";

import { DatabaseError, handleDatabaseError, PG_ERROR_CODES } from "./db/errorCodes";
import { spyOn } from "bun:test";

const app = express();
app.use(express.json());


app.post("/user/signin", async (req, res) => {


  try {
  const {username, password} = req.body;
  console.log("conneting db ....");
  const result = await pool.query("SELECT * FROM users WHERE username = $1 AND password=$2",[username, password]);
  console.log("db connected. ");
  if(result.rows.length>0) {
    return res.status(200).json({message: "user has been logged in successfully"});
  } else {
    return res.status(401).json({Message: "Username or password is incorrect"});
  }


  }catch(err) {
    console.log(err);
    return res.status(500).json({Message : "Something went wrong"});
  }

});

app.post("/user/signup", async (req, res) => {


 try {

  // Add this right after your database connection is established
const result = await pool.query('SELECT current_database()');
console.log('Application connected to DB:', result.rows[0].current_database);


  const {username, email, password, balance} = req.body;
  await pool.query( 
    "INSERT INTO users (username, email, password, balance) VALUES ($1, $2, $3, $4)",
    [username, email, password, balance]
  );

  return res.json({Message : "User inserted successfully"});

 } catch(err) {
  console.log(err);
  return res.status(500).json({Message : "Something went wrong"});
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


app.post("/admin/market", async (req, res) => {
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
    resolved: market.resolved,
    result: market.result
  });
  res.json({ ...market, prices });
});

app.post("/user/load", async (require, resp) => {
  try{

    const {user_id, loadTxnAmt} = require.body;

    const fetchUser = await pool.query("SELECT * from users where id=$1", [user_id]);
    if(fetchUser.rows.length === 0) {
      console.error("USer Not found")
      return resp.status(404).json({error: "User not found"});
    } 
    const user = fetchUser.rows[0];

    const updatedBalance = Number(user.balance) + Number(loadTxnAmt);
    const result = await pool.query("UPDATE users set balance = $1 where id=$2", [updatedBalance, user_id]);

    console.log("User has been loaded successfully", result);
    return resp.status(201).json({Message: `User has been loaded successfully ${result.rows[0]}`});

  } catch(err) {
    console.log("Error Occurred:: ", err);
    // resp.status()
    const dbError = handleDatabaseError(err as DatabaseError);
    console.log("err", err , "dbError", dbError);
    return resp.status(dbError.status).json({ message: dbError.message, detail: dbError.detail });
 

  }
})

app.post("/trade", async (req, res) => {
  try {
    const { market_id, user_id, outcome, shares  } = req.body;

    if(!market_id || !user_id || !outcome || !shares) {
      return res.status(400).json({error: "Missing Mandatory parameters"});
    }

  const fetchMarket = await pool.query("SELECT * FROM markets WHERE id=$1", [market_id]);

  if(fetchMarket.rows.length === 0 ) {
    return res.status(404).json({error: "Market not found"});
  }
  const market = fetchMarket.rows[0];

  if(market.resolved === true) {
    return res.status(400).json({error: "Market is closed"});
  }


  const fetchUser = await pool.query("SELECT * FROM users where id=$1", [user_id]);

  if(fetchUser.rows.length === 0 ) {
    return res.status(404).json({error: "User not found"});
  }

  const user = fetchUser.rows[0];

  const cost = costToBuy(
    {
      id: market.id,
      question: market.question,
      q_yes: market.q_yes,
      q_no: market.q_no,
      b: market.b,
      resolved: market.resolved,
      result: market.result
    },
    outcome,
    shares
  );

  console.log("cost, user & user Balance::", cost, user, user.balance);

  if(cost> user.balance) {
    return res.status(400).json({error: PG_ERROR_CODES.INSUFFICIENT_BALANCE});
  }

  const updatedBalance  = Number(user.balance) - Number(cost);

  if (outcome === "yes") market.q_yes += shares;
  else market.qno += shares;

  await pool.query("UPDATE markets SET q_yes=$1, q_no=$2 WHERE id=$3", [
    market.q_yes,
    market.qno,
    market.id,
  ]);

  await pool.query(
    "INSERT INTO trades (market_id, user_id, outcome, shares, price) VALUES ($1, $2, $3, $4, $5)",
    [market.id, user_id, outcome, shares, cost]
  );

  await pool.query("UPDATE users SET balance=$1 where id=$2", [
    updatedBalance,
    user_id
  ])

  res.json({ cost, newPrices: getPrices(market) });

  } catch(err) {

    const dbError = handleDatabaseError(err as DatabaseError);
    console.log("err", err , "dbError", dbError);
    return res.status(dbError.status).json({ message: dbError.message, detail: dbError.detail });
 

  }
});

app.listen(process.env.PORT || 4000, () =>
  console.log(`Server running on port ${process.env.PORT || 4000}`)
);

await initDB();