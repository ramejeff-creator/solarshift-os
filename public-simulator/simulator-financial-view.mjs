// Adapt server projections to the public summary without recalculating cashflows.
export function ownerFinancialView(financial) {
  const owner=financial?.ownerProjection;
  if(!owner)return financial;
  return {
    ...financial,...owner,
    status:financial.status==='ASSUMPTION'&&owner.status==='ASSUMPTION'?'ASSUMPTION':'PARTIAL',
    projection:Array.isArray(owner.projection)?owner.projection.map(row=>({
      ...row,cumulativeNetGainEur:row.cumulativeNetCashflowEur
    })):[]
  };
}
