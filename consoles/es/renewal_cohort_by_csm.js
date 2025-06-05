/*  ──────────────────────────────────────────────────────────────────────────
    RENEWAL RATE BY CSM – MONTHLY 2024 COHORTS
    Each row  : CSM Owner
    Each col  : Won-month (YYYY-MM)
    Cell value: Renewal Rate  (Customer / (Customer + Churn))  – fixed 2-dec strings
   ────────────────────────────────────────────────────────────────────────── */
db.es_close_leads.aggregate([
  /* 1️⃣  keep leads that have a Client-Won date */
  { $match: { "custom.Client Won Date": { $exists: true, $ne: "" } } },

  /* 2️⃣  derive wonMonth (YYYY-MM), map status → Customer / Churn */
  { $addFields: {
      wonMonth: { $substr: [ "$custom.Client Won Date", 0, 7 ] },
      status_category: {
        $switch: {
          branches: [
            { case: { $regexMatch: { input: "$status_label", regex: /customer/i } }, then: "Customer" },
            { case: { $regexMatch: { input: "$status_label", regex: /churn/i }    }, then: "Churn"   }
          ],
          default: null
        }
      }
  }},

  /* 3️⃣  keep only 2024 cohorts & valid status buckets            */
  { $match: {
      wonMonth:        { $regex: "^2024" },
      status_category: { $in: ["Customer", "Churn"] }
  }},

  /* 4️⃣  resolve CSM owner (same logic you already use)            */
  { $addFields: {
      csm_owner_id: {
        $ifNull: [
          { $getField: {
              field: "custom.cf_noF6qnZhFDHUYQQBzokx957zkdceLfFZtqCZ1RTsIvJ",
              input: "$$ROOT"
          }},
          "Unassigned"
        ]
      }
  }},
  { $lookup: {
      from: "es_close_users",
      localField: "csm_owner_id",
      foreignField: "id",
      as: "ownerUser"
  }},
  { $addFields: { ownerDoc: { $arrayElemAt: [ "$ownerUser", 0 ] } } },
  { $addFields: {
      csm_owner: {
        $cond: [
          { $eq: [ "$csm_owner_id", "Unassigned" ] },
          "Unassigned",
          { $ifNull: [
              { $let: {
                  vars: {
                    fn: { $ifNull: [ "$ownerDoc.first_name", "" ] },
                    ln: { $ifNull: [ "$ownerDoc.last_name",  "" ] }
                  },
                  in: { $trim: { input: { $concat: [ "$$fn", " ", "$$ln" ] } } }
              }},
              { $ifNull: [ "$ownerDoc.email", "$csm_owner_id" ] }
          ] }
        ]
      }
  }},

  /* 5️⃣  aggregate per CSM + wonMonth to compute renewal metrics   */
  { $group: {
      _id: { csm: "$csm_owner", month: "$wonMonth" },
      renewed: { $sum: { $cond: [ { $eq: ["$status_category", "Customer"] }, 1, 0 ] } },
      total:   { $sum: 1 }
  }},

  /* 6️⃣  calculate renewal-rate and format as 2-dec string         */
  { $addFields: {
      renewal_rate: {
        $let: {
          vars: {
            /* integer percentage ×100 – already rounded                   */
            pctInt: {
              $round: [
                { $multiply: [
                    { $cond: [
                        { $eq: ["$total", 0] },
                        0,
                        { $divide: ["$renewed", "$total"] }
                    ] },
                    100
                ] },
                0
              ]
            }
          },
          in: {
            $let: {
              vars: {
                intPart:  { $floor: { $divide: ["$$pctInt", 100] } },   /* 0 or 1 */
                decPart:  { $mod:   ["$$pctInt", 100] }                /* 0-99    */
              },
              in: {
                $concat: [
                  { $toString: "$$intPart" },
                  ".",
                  { $cond: [
                      { $gte: ["$$decPart", 10] },
                      { $toString: "$$decPart" },
                      { $concat: [ "0", { $toString: "$$decPart" } ] }
                  ] }
                ]
              }
            }
          }
        }
      }
  }},

  /* 7️⃣  pivot months → columns (value = formatted string)          */
  { $group: {
      _id: "$_id.csm",
      months_kv: { $push: { k: "$_id.month", v: "$renewal_rate" } }
  }},
  { $addFields: { months_obj: { $arrayToObject: "$months_kv" } } },

  /* 8️⃣  reshape – the order of keys is preserved w/ $replaceRoot  */
  { $replaceRoot: { newRoot: { $mergeObjects: [ { csm_owner: "$_id" }, "$months_obj" ] } } },

  /* 9️⃣  sort by CSM owner                                         */
  { $sort: { csm_owner: 1 } }
]);