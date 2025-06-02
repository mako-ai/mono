db.spain_close_leads.aggregate([
  /* 1️⃣ explode the opportunities array */
  { $unwind: "$opportunities" },

  /* 2️⃣ keep only won opportunities in Q1-2024 */
  { $match: {
      "opportunities.status_type": "won",
      "opportunities.date_won": {
        $gte: "2024-01-01",
        $lte: "2024-05-31T23:59:59"
      }
  }},

  /* 3️⃣ pull the raw CSM-owner id (custom field with a dot) */
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

  /* 4️⃣ deduplicate so each lead is counted once */
  { $group: {
      _id: "$id",
      csm_owner_id : { $first: "$csm_owner_id" },
      lead_status  : { $first: "$status_label" }
  }},

  /* 5️⃣ translate owner id → readable name (via spain_close_users) */
  { $lookup: {
      from: "spain_close_users",
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
          {
            $ifNull: [
              /* first choice: "First Last" */
              {
                $let: {
                  vars: {
                    fn: { $ifNull: [ "$ownerDoc.first_name", "" ] },
                    ln: { $ifNull: [ "$ownerDoc.last_name",  "" ] }
                  },
                  in: { $trim: { input: { $concat: [ "$$fn", " ", "$$ln" ] } } }
                }
              },
              /* fallback: email or finally the id */
              { $ifNull: [ "$ownerDoc.email", "$csm_owner_id" ] }
            ]
          }
        ]
      }
  }},

  /* 6️⃣ bucket the statuses into Customer / Churn – discard the rest */
  { $addFields: {
      status_category: {
        $switch: {
          branches: [
            { case: { $regexMatch: { input: "$lead_status", regex: /customer/i } }, then: "Customer" },
            { case: { $regexMatch: { input: "$lead_status", regex: /churn/i    } }, then: "Churn" }
          ],
          default: null
        }
      }
  }},
  { $match: { status_category: { $ne: null } } },

  /* 7️⃣ count by owner + simplified status */
  { $group: {
      _id : { csm_owner: "$csm_owner", status: "$status_category" },
      cnt : { $sum: 1 }
  }},

  /* 8️⃣ pivot the two statuses into columns */
  { $group: {
      _id       : "$_id.csm_owner",
      status_kv : { $push: { k: "$_id.status", v: "$cnt" } }
  }},
  { $addFields: { status_obj: { $arrayToObject: "$status_kv" } } },

  /* 9️⃣ flatten + fill missing columns & compute metrics */
  { $replaceRoot: {
      newRoot: {
        $mergeObjects: [
          { csm_owner: "$_id" },
          { $ifNull: [ "$status_obj", {} ] }
        ]
      }
  }},
  { $addFields: {
      Customer: { $ifNull: [ "$Customer", 0 ] },
      Churn   : { $ifNull: [ "$Churn",    0 ] }
  }},
  { $addFields: {
      Total: { $add: [ "$Customer", "$Churn" ] }
  }},
  /* 🔟 retention_rate as percentage, rounded to nearest int */
  { $addFields: {
      retention_rate: {
        $cond: [
          { $gt: [ "$Total", 0 ] },
          { $round: [
              { $multiply: [
                  { $divide: [ "$Customer", "$Total" ] }, 100
              ] },
              0
            ]
          },
          null
        ]
      }
  }},

  /* 11️⃣ final ordering */
  { $sort: { csm_owner: 1 } }
])