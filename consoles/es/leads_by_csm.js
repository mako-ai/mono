// Pivoted “won in June 2024” leads by CSM owner & renewal probability,
// showing the owner’s real name instead of the raw CSM Owner id.
db.spain_close_leads.aggregate([
  /* 0) Filter – June-2024 customers only */
  {
    $match: {
      "opportunities.date_won": { $regex: "^2024-06" },
      status_label: { $regex: "Customer" },
    },
  },

  /* 1) Bring in the user document that matches the CSM Owner id */
  {
    $lookup: {
      from: "spain_close_users",
      localField: "custom.CSM Owner", // id stored in the lead
      foreignField: "id", // id stored in the users collection
      as: "user",
    },
  },
  { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },

  /* 2) Compute a human-readable CSM owner name with sensible fall-backs
        (full name → e-mail → raw id → “Unknown CSM”) */
  {
    $addFields: {
      csm_owner_name: {
        $let: {
          vars: {
            fullName: {
              $trim: {
                input: {
                  $concat: [
                    { $ifNull: ["$user.first_name", ""] },
                    " ",
                    { $ifNull: ["$user.last_name", ""] },
                  ],
                },
              },
            },
            email: "$user.email",
            rawId: "$custom.CSM Owner",
          },
          in: {
            $ifNull: [
              {
                $cond: [
                  { $ne: ["$$fullName", ""] }, // full name present?
                  "$$fullName",
                  "$$email",
                ],
              },
              { $ifNull: ["$$rawId", "Unknown CSM"] },
            ],
          },
        },
      },
    },
  },

  /* 3) Count per CSM owner + renewal probability */
  {
    $group: {
      _id: {
        owner: { $ifNull: ["$csm_owner_name", "Unknown CSM"] },
        renewalProbability: {
          $ifNull: ["$custom.Renewal Probability", "Unknown"],
        },
      },
      count: { $sum: 1 },
    },
  },

  /* 4) Regroup by CSM owner – build {k,v} array + total */
  {
    $group: {
      _id: "$_id.owner",
      renewalProbabilities: {
        $push: { k: { $toString: "$_id.renewalProbability" }, v: "$count" },
      },
      total: { $sum: "$count" },
    },
  },

  /* 5) Pivot into a single document per CSM owner */
  {
    $replaceRoot: {
      newRoot: {
        $mergeObjects: [
          { csm_owner: "$_id" },
          { $arrayToObject: "$renewalProbabilities" },
          { "total (all renewal probabilities)": "$total" },
        ],
      },
    },
  },

  /* 6) Sort – most customers first */
  { $sort: { "total (all renewal probabilities)": -1 } },
]);
