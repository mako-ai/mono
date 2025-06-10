// atlas.revops
// Calculate ARR only from WON opportunities where the related lead is still an active customer, result in EUR

db.es_close_opportunities.aggregate([
  // Step 1: Match only opportunities that are WON and have a valid (linked) lead_id
  { $match: { status_type: 'won', lead_id: { $ne: null } } },

  // Step 2: Lookup the lead and filter to leads with customer status
  {
    $lookup: {
      from: 'es_close_leads',
      localField: 'lead_id',
      foreignField: 'id',
      as: 'lead',
    },
  },

  // Step 3: Only those where lead.status_label = "Customer" (still active)
  { $unwind: '$lead' },
  { $match: { 'lead.status_label': { $regex: 'customer', $options: 'i' } } },

  // Step 4: (optional) Only count positive ARR values
  { $match: { annualized_value: { $gt: 0 } } },

  // Step 5: Sum annualized_value and divide by 100 to get EUR
  {
    $group: {
      _id: null,
      ARR_EUR: { $sum: { $divide: ['$annualized_value', 100] } },
    },
  },
]);
