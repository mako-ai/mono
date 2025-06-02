db.switzerland_close_leads.aggregate([
  // 1) count per owner+status
  {
    $group: {
      _id: {
        owner: "$custom.Lead Owner",
        status: "$status_label",
      },
      count: { $sum: 1 },
    },
  },

  // 2) regroup by owner: build an array of {k,v} pairs + total
  {
    $group: {
      _id: "$_id.owner",
      statuses: {
        $push: { k: "$_id.status", v: "$count" },
      },
      total: { $sum: "$count" },
    },
  },

  // 3) lookup user information to get actual names
  {
    $lookup: {
      from: "switzerland_close_users",
      localField: "_id",
      foreignField: "id",
      as: "user_info",
    },
  },

  // 4) sort statuses alphabetically by status name
  {
    $addFields: {
      statuses: {
        $sortArray: {
          input: "$statuses",
          sortBy: { k: 1 },
        },
      },
    },
  },

  // 5) add computed field for display name
  {
    $addFields: {
      display_name: {
        $cond: {
          if: { $gt: [{ $size: "$user_info" }, 0] },
          then: {
            $let: {
              vars: {
                user: { $arrayElemAt: ["$user_info", 0] },
              },
              in: {
                $cond: {
                  if: {
                    $and: [
                      { $ne: ["$$user.first_name", null] },
                      { $ne: ["$$user.last_name", null] },
                    ],
                  },
                  then: {
                    $concat: ["$$user.first_name", " ", "$$user.last_name"],
                  },
                  else: {
                    $cond: {
                      if: { $ne: ["$$user.first_name", null] },
                      then: "$$user.first_name",
                      else: {
                        $cond: {
                          if: { $ne: ["$$user.last_name", null] },
                          then: "$$user.last_name",
                          else: "$$user.email",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          else: "$_id", // fallback to original ID if user not found
        },
      },
    },
  },

  // 6) merge display name, each status field, and total all into the root
  {
    $replaceRoot: {
      newRoot: {
        $mergeObjects: [
          { lead_owner: "$display_name" },
          { $arrayToObject: "$statuses" },
          { "total (all status)": "$total" },
        ],
      },
    },
  },

  // 7) final sort by total descending
  {
    $sort: { "total (all status)": -1 },
  },
]);
