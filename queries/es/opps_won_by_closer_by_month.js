db.spain_close_opportunities.aggregate([
  {
    $match: {
      status_type: "won", // Filter for active opportunities
      date_won: { $exists: true, $ne: null }, // Ensure date_won exists and is not null
    },
  },

  // 1) count per closer + month (yyyy-mm format)
  {
    $group: {
      _id: {
        closer: {
          $ifNull: ["$user_name", "Unknown Closer"],
        },
        month: {
          $substr: ["$date_won", 0, 7], // Extract yyyy-mm from date_won
        },
      },
      count: { $sum: 1 },
    },
  },

  // 2) regroup by closer: build an array of {k,v} pairs + total
  {
    $group: {
      _id: "$_id.closer",
      months: {
        $push: {
          k: { $toString: "$_id.month" },
          v: "$count",
        },
      },
      total: { $sum: "$count" },
    },
  },

  // 2.5) sort the months array alphabetically (yyyy-mm) before merging into object
  {
    $addFields: {
      months: {
        $sortArray: {
          input: "$months",
          sortBy: { k: 1 },
        },
      },
    },
  },

  // 3) merge closer, each month field, and total all into the root
  {
    $replaceRoot: {
      newRoot: {
        $mergeObjects: [
          { closer: "$_id" },
          { $arrayToObject: "$months" },
          { "total (all months)": "$total" },
        ],
      },
    },
  },

  // 4) final sort by total descending
  {
    $sort: { "total (all months)": -1 },
  },
]);

// spain_close_opportunities – won count by month (columns)
//                       & by pipeline / product / user (rows)
db.spain_close_opportunities.aggregate([
  /* 1. Only WON opportunities that have a won date */
  {
    $match: {
      status_type: "won",
      date_won: { $ne: null },
    },
  },

  /* 2. Derive helper columns */
  {
    $addFields: {
      /* product is a TOP-LEVEL key that contains a dot, so use $getField */
      product: {
        $ifNull: [
          {
            $getField: {
              field: "custom.cf_M2IFcDmkpaKL6mIK90Cr7AzGL6i8AvAspixN3AeS1IV",
              input: "$$ROOT",
            },
          },
          "Unspecified",
        ],
      },
      /* YYYY-MM bucket from the string date */
      month: { $substrBytes: ["$date_won", 0, 7] },
    },
  },

  /* 3. Count wins for each pipeline / product / user / month */
  {
    $group: {
      _id: {
        pipeline: "$pipeline_name",
        product: "$product",
        user: "$user_name",
        month: "$month",
      },
      wins: { $sum: 1 },
    },
  },

  /* 4. Pivot months → k/v pairs */
  {
    $group: {
      _id: {
        pipeline: "$_id.pipeline",
        product: "$_id.product",
        user: "$_id.user",
      },
      monthPairs: {
        $push: { k: "$_id.month", v: "$wins" },
      },
    },
  },

  /* 5. k/v array → object */
  { $addFields: { months: { $arrayToObject: "$monthPairs" } } },

  /* 6. Flatten row */
  {
    $replaceRoot: {
      newRoot: {
        $mergeObjects: [
          {
            pipeline: "$_id.pipeline",
            product: "$_id.product",
            user: "$_id.user",
          },
          "$months",
        ],
      },
    },
  },

  /* 7. Sort for readability */
  { $sort: { pipeline: 1, product: 1, user: 1 } },
]);
