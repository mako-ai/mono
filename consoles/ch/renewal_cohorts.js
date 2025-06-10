db.ch_close_leads.aggregate([
  // 1. Filter leads with Start Date in 2024
  {
    $match: {
      "custom.Start Date": { $regex: "^2024-" },
    },
  },
  // 2. Project start month (YYYY-MM), renewal status (considering churned status)
  {
    $project: {
      startMonth: { $substr: ["$custom.Start Date", 0, 7] },
      renewalStatus: {
        $cond: [
          { $regexMatch: { input: "$status_label", regex: /churned/i } },
          "Churned",
          { $ifNull: ["$custom.Renewal Status", "Unknown"] },
        ],
      },
    },
  },
  // 3. Group by renewalStatus and startMonth to count leads
  {
    $group: {
      _id: { renewalStatus: "$renewalStatus", month: "$startMonth" },
      count: { $sum: 1 },
    },
  },
  // 4. Pivot months into columns grouped by renewalStatus
  {
    $group: {
      _id: "$_id.renewalStatus",
      months: { $push: { k: "$_id.month", v: "$count" } },
    },
  },
  // 5. Convert months array to object
  {
    $project: {
      renewal_status: "$_id",
      monthCounts: { $arrayToObject: "$months" },
    },
  },
  // 6. Ensure all months present
  {
    $replaceRoot: {
      newRoot: {
        renewal_status: "$renewal_status",
        "2024-01": { $ifNull: ["$monthCounts.2024-01", 0] },
        "2024-02": { $ifNull: ["$monthCounts.2024-02", 0] },
        "2024-03": { $ifNull: ["$monthCounts.2024-03", 0] },
        "2024-04": { $ifNull: ["$monthCounts.2024-04", 0] },
        "2024-05": { $ifNull: ["$monthCounts.2024-05", 0] },
        "2024-06": { $ifNull: ["$monthCounts.2024-06", 0] },
        "2024-07": { $ifNull: ["$monthCounts.2024-07", 0] },
        "2024-08": { $ifNull: ["$monthCounts.2024-08", 0] },
        "2024-09": { $ifNull: ["$monthCounts.2024-09", 0] },
        "2024-10": { $ifNull: ["$monthCounts.2024-10", 0] },
        "2024-11": { $ifNull: ["$monthCounts.2024-11", 0] },
        "2024-12": { $ifNull: ["$monthCounts.2024-12", 0] },
      },
    },
  },
  // 7. Collect all statuses into one array
  {
    $group: {
      _id: null,
      statuses: { $push: "$$ROOT" },
    },
  },
  // 8. Compute totals and renewal rates
  {
    $project: {
      statuses: 1,
      total: {
        renewal_status: "Total",
        "2024-01": { $sum: "$statuses.2024-01" },
        "2024-02": { $sum: "$statuses.2024-02" },
        "2024-03": { $sum: "$statuses.2024-03" },
        "2024-04": { $sum: "$statuses.2024-04" },
        "2024-05": { $sum: "$statuses.2024-05" },
        "2024-06": { $sum: "$statuses.2024-06" },
        "2024-07": { $sum: "$statuses.2024-07" },
        "2024-08": { $sum: "$statuses.2024-08" },
        "2024-09": { $sum: "$statuses.2024-09" },
        "2024-10": { $sum: "$statuses.2024-10" },
        "2024-11": { $sum: "$statuses.2024-11" },
        "2024-12": { $sum: "$statuses.2024-12" },
      },
      renewed: {
        $arrayElemAt: [
          {
            $filter: {
              input: "$statuses",
              cond: { $eq: ["$$this.renewal_status", "Renewed"] },
            },
          },
          0,
        ],
      },
    },
  },
  // 9. Calculate renewal rate and round to 2 decimals
  {
    $project: {
      statuses: 1,
      total: 1,
      renewal_rate: {
        renewal_status: "Renewal Rate",
        "2024-01": {
          $cond: [
            { $eq: ["$total.2024-01", 0] },
            null,
            {
              $round: [{ $divide: ["$renewed.2024-01", "$total.2024-01"] }, 2],
            },
          ],
        },
        "2024-02": {
          $cond: [
            { $eq: ["$total.2024-02", 0] },
            null,
            {
              $round: [{ $divide: ["$renewed.2024-02", "$total.2024-02"] }, 2],
            },
          ],
        },
        "2024-03": {
          $cond: [
            { $eq: ["$total.2024-03", 0] },
            null,
            {
              $round: [{ $divide: ["$renewed.2024-03", "$total.2024-03"] }, 2],
            },
          ],
        },
        "2024-04": {
          $cond: [
            { $eq: ["$total.2024-04", 0] },
            null,
            {
              $round: [{ $divide: ["$renewed.2024-04", "$total.2024-04"] }, 2],
            },
          ],
        },
        "2024-05": {
          $cond: [
            { $eq: ["$total.2024-05", 0] },
            null,
            {
              $round: [{ $divide: ["$renewed.2024-05", "$total.2024-05"] }, 2],
            },
          ],
        },
        "2024-06": {
          $cond: [
            { $eq: ["$total.2024-06", 0] },
            null,
            {
              $round: [{ $divide: ["$renewed.2024-06", "$total.2024-06"] }, 2],
            },
          ],
        },
        "2024-07": {
          $cond: [
            { $eq: ["$total.2024-07", 0] },
            null,
            {
              $round: [{ $divide: ["$renewed.2024-07", "$total.2024-07"] }, 2],
            },
          ],
        },
        "2024-08": {
          $cond: [
            { $eq: ["$total.2024-08", 0] },
            null,
            {
              $round: [{ $divide: ["$renewed.2024-08", "$total.2024-08"] }, 2],
            },
          ],
        },
        "2024-09": {
          $cond: [
            { $eq: ["$total.2024-09", 0] },
            null,
            {
              $round: [{ $divide: ["$renewed.2024-09", "$total.2024-09"] }, 2],
            },
          ],
        },
        "2024-10": {
          $cond: [
            { $eq: ["$total.2024-10", 0] },
            null,
            {
              $round: [{ $divide: ["$renewed.2024-10", "$total.2024-10"] }, 2],
            },
          ],
        },
        "2024-11": {
          $cond: [
            { $eq: ["$total.2024-11", 0] },
            null,
            {
              $round: [{ $divide: ["$renewed.2024-11", "$total.2024-11"] }, 2],
            },
          ],
        },
        "2024-12": {
          $cond: [
            { $eq: ["$total.2024-12", 0] },
            null,
            {
              $round: [{ $divide: ["$renewed.2024-12", "$total.2024-12"] }, 2],
            },
          ],
        },
      },
    },
  },
  // 10. Final output
  {
    $project: {
      result: { $concatArrays: ["$statuses", ["$total", "$renewal_rate"]] },
    },
  },
  { $unwind: "$result" },
  { $replaceRoot: { newRoot: "$result" } },
]);
