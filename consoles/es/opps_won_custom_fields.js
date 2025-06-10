// DB: atlas.revops
// WON sales by closer+product by month in 2025 (Spain), excluding where date_won === custom.cf_GdzdOESUbPaVk8HHjXJackgVHHpG17oYnSDQqtxo5GB
// Product name is in: custom.cf_M2IFcDmkpaKL6mIK90Cr7AzGL6i8AvAspixN3AeS1IV

const months = [
  "2025-01",
  "2025-02",
  "2025-03",
  "2025-04",
  "2025-05",
  "2025-06",
  "2025-07",
  "2025-08",
  "2025-09",
  "2025-10",
  "2025-11",
  "2025-12",
];

db.es_close_opportunities.aggregate([
  {
    $match: {
      status_type: "won",
      date_won: { $gte: "2025-01-01", $lt: "2026-01-01" },
      $expr: {
        $ne: [
          "$date_won",
          {
            $getField: {
              field: "cf_GdzdOESUbPaVk8HHjXJackgVHHpG17oYnSDQqtxo5GB",
              input: "$custom",
            },
          },
        ],
      },
    },
  },
  {
    $addFields: {
      month: { $substr: ["$date_won", 0, 7] },
      product: {
        $getField: {
          field: "cf_M2IFcDmkpaKL6mIK90Cr7AzGL6i8AvAspixN3AeS1IV",
          input: "$custom",
        },
      },
    },
  },
  {
    $group: {
      _id: { closer: "$user_name", product: "$product", month: "$month" },
      sales: { $sum: 1 },
    },
  },
  {
    $group: {
      _id: { closer: "$_id.closer", product: "$_id.product" },
      monthlyCounts: { $push: { k: "$_id.month", v: "$sales" } },
    },
  },
  {
    $addFields: {
      monthlyCounts: {
        $arrayToObject: {
          $concatArrays: [months.map(m => ({ k: m, v: 0 })), "$monthlyCounts"],
        },
      },
    },
  },
  {
    $addFields: {
      result: {
        $mergeObjects: [
          { closer: "$_id.closer", product: "$_id.product" },
          months.reduce((obj, m) => {
            obj[m] = {
              $ifNull: [
                { $getField: { field: m, input: "$monthlyCounts" } },
                0,
              ],
            };
            return obj;
          }, {}),
        ],
      },
    },
  },
  { $replaceRoot: { newRoot: "$result" } },
  { $project: { _id: 0 } },
]);
