// es/renewal_cohorts  ── full refresh
db.spain_close_leads.aggregate([

  /*  ----------------------------  COMMON FILTERS  ---------------------------- */
  {
    $match: {
      "custom.Client Won Date": { $exists: true, $ne: "" }
    }
  },
  {
    $addFields: {
      wonMonth: { $substr: ["$custom.Client Won Date", 0, 7] },         // e.g. "2024-05"
      groupStatus: {
        $cond: [
          { $regexMatch: { input: "$status_label", regex: "Customer", options: "i" } },
          "Customer",
          "$status_label"
        ]
      }
    }
  },
  {
    $match: {
      wonMonth:   { $regex: "^2024" },                                   // 2024 cohorts only
      groupStatus:{ $in: ["Customer", "Churned"] }
    }
  },

  /*  -------------------------------  FACETS  -------------------------------- */
  {
    $facet: {
      /*  -------  CUSTOMER ROW  ------- */
      customer: [
        { $match: { groupStatus: "Customer" } },
        { $group: { _id: "$wonMonth", count: { $sum: 1 } } },
        {
          $group: {
            _id: null,
            months: { $push: { k: "$_id", v: "$count" } },
            total:  { $sum: "$count" }
          }
        },
        { $addFields: { Status: "Customer", row_order: 1 } },
        {
          $replaceWith: {
            $mergeObjects: [
              { Status: "$Status", row_order: "$row_order" },
              { $arrayToObject: "$months" },
              { total: "$total" }
            ]
          }
        }
      ],

      /*  -------  CHURNED ROW  ------- */
      churned: [
        { $match: { groupStatus: "Churned" } },
        { $group: { _id: "$wonMonth", count: { $sum: 1 } } },
        {
          $group: {
            _id: null,
            months: { $push: { k: "$_id", v: "$count" } },
            total:  { $sum: "$count" }
          }
        },
        { $addFields: { Status: "Churned", row_order: 2 } },
        {
          $replaceWith: {
            $mergeObjects: [
              { Status: "$Status", row_order: "$row_order" },
              { $arrayToObject: "$months" },
              { total: "$total" }
            ]
          }
        }
      ],

      /*  -------  TOTAL ROW  ------- */
      totalRow: [
        { $group: { _id: "$wonMonth", count: { $sum: 1 } } },            // both cohorts
        {
          $group: {
            _id: null,
            months: { $push: { k: "$_id", v: "$count" } },
            total:  { $sum: "$count" }
          }
        },
        { $addFields: { Status: "Total (Churned + Renewed)", row_order: 3 } },
        {
          $replaceWith: {
            $mergeObjects: [
              { Status: "$Status", row_order: "$row_order" },
              { $arrayToObject: "$months" },
              { total: "$total" }
            ]
          }
        }
      ],

      /*  -------  RENEWAL RATE ROW  ------- */
      renewalRate: [
        {
          $group: {
            _id: "$wonMonth",
            renewed: { $sum: { $cond: [ { $eq: ["$groupStatus", "Customer"] }, 1, 0 ] } },
            total:   { $sum: 1 }
          }
        },
        /* compute & round to 2 decimals */
        {
          $addFields: {
            rate: {
              $cond: [ { $eq: ["$total", 0] }, 0, { $round: [ { $divide: ["$renewed", "$total"] }, 2 ] } ]
            }
          }
        },
        { $group: { _id: null, months: { $push: { k: "$_id", v: "$rate" } } } },
        { $addFields: { Status: "Renewal Rate (Renewed/Total)", row_order: 4 } },
        {
          $replaceWith: {
            $mergeObjects: [
              { Status: "$Status", row_order: "$row_order" },
              { $arrayToObject: "$months" }
            ]
          }
        }
      ]
    }
  },

  /*  ---------  MERGE FACETS, SORT BY row_order  --------- */
  {
    $project: {
      allRows: { $concatArrays: [ "$customer", "$churned", "$totalRow", "$renewalRate" ] }
    }
  },
  { $unwind: "$allRows" },
  { $replaceRoot: { newRoot: "$allRows" } },
  { $sort: { row_order: 1 } },

  /*  ---------  CLEANUP  --------- */
  { $project: { _id: 0, row_order: 0 } }
]);