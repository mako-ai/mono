/* --------  TOP-SALES-PEOPLE  (all countries)  -------- */
db.spain_close_opportunities.aggregate([
  /* ——— 1)  SPAIN  ——— */
  { $match: { status_type: "won", date_won: { $ne: null } } },
  { $project: { closer: "$user_name", date_won: 1 } },

  /* ——— 2)  FRANCE  ——— */
  {
    $unionWith: {
      coll: "france_close_opportunities",
      pipeline: [
        { $match: { status_type: "won", date_won: { $ne: null } } },
        { $project: { closer: "$user_name", date_won: 1 } },
      ],
    },
  },

  /* ——— 3)  ITALY  ——— */
  {
    $unionWith: {
      coll: "italy_close_opportunities",
      pipeline: [
        { $match: { status_type: "won", date_won: { $ne: null } } },
        { $project: { closer: "$user_name", date_won: 1 } },
      ],
    },
  },

  /* ——— 4)  SWITZERLAND  ——— */
  {
    $unionWith: {
      coll: "switzerland_close_opportunities",
      pipeline: [
        { $match: { status_type: "won", date_won: { $ne: null } } },
        { $project: { closer: "$user_name", date_won: 1 } },
      ],
    },
  },

  /* ——— 5)  BUILD YYYY-MM BUCKET  ——— */
  {
    $addFields: {
      month: {
        $dateToString: { format: "%Y-%m", date: { $toDate: "$date_won" } },
      },
    },
  },

  /* ——— 6)  COUNT WINS PER (CLOSER, MONTH)  ——— */
  {
    $group: {
      _id: { closer: "$closer", month: "$month" },
      sales: { $sum: 1 },
    },
  },

  /* ——— 7)  PIVOT  ——— */
  /* collect each month → value pair */
  {
    $group: {
      _id: "$_id.closer",
      kv: { $push: { k: "$_id.month", v: "$sales" } },
    },
  },
  /* kv array → object, merge with { closer } */
  {
    $project: {
      _id: 0,
      closer: "$_id",
      pivot: { $arrayToObject: "$kv" },
    },
  },
  {
    $replaceRoot: {
      newRoot: { $mergeObjects: [{ closer: "$closer" }, "$pivot"] },
    },
  },

  /* ——— 8)  OPTIONAL: add total & sort by it  ——— */
  {
    $addFields: {
      total: {
        $reduce: {
          input: { $objectToArray: "$$ROOT" },
          initialValue: 0,
          in: {
            $cond: [
              { $eq: ["$$this.k", "closer"] },
              "$$value",
              { $add: ["$$value", "$$this.v"] },
            ],
          },
        },
      },
    },
  },
  { $sort: { total: -1 } }, // top performers first
]);

/* -----  SAMPLE RESULT  -----
{
  "closer"  : "Amanda Delgado",
  "2024-01" : 12,
  "2024-02" : 18,
  "2024-03" : 17,
  "2024-04" : 15,
  "2024-05" : 14,
  ...
  "total"   : 396
},
{
  "closer"  : "Emanuele La Targia",
  "2024-01" :  5,
  "2024-02" :  7,
  ...
  "total"   : 239
},
...
*/
