interface SimulationResults {
  totalPaid: number;
  totalRewardsEarned: number;
  roi: number;
  monthlyBreakdown: Array<{
    month: number;
    subscribers: number;
    rewardPoolContribution: number;
    multiplier: number;
    rewardsEarned: number;
  }>;
}

const DEFAULT_CONFIG = {
  monthlyFeeUSD: 5,
  rewardPoolBasisPoints: 2000, // 20%
  clientFeeBasisPoints: 500,   // 5%
  protocolFeeBasisPoints: 100, // 1%
  initialSubscribers: 30,
  annualGrowthRate: 10, // 10x per year
  months: 60, // 5 years
  formulaBase: 1.2, // 20% decay per month
  minMultiplier: 0,
  subscriberStartMonth: 0,
  subscriberMonths: 60,
};

function calculateMonthlyGrowthRate(annualMultiplier: number): number {
  // For a 10x annual growth, we need the 12th root of 10
  // For example, if we want to go from 100 to 1000 in a year,
  // each month should multiply by the 12th root of 10
  return Math.pow(annualMultiplier, 1/12) - 1;
}

function calculateRewards(config = DEFAULT_CONFIG): SimulationResults {
  const monthlyGrowthRate = calculateMonthlyGrowthRate(config.annualGrowthRate);
  const MAX_BPS = 10000;
  
  // Calculate portion of subscription that goes to reward pool after fees
  const feeMultiplier = (MAX_BPS - config.clientFeeBasisPoints - config.protocolFeeBasisPoints) / MAX_BPS;
  const rewardPoolMultiplier = config.rewardPoolBasisPoints / MAX_BPS;
  const monthlyRewardPoolContribution = config.monthlyFeeUSD * feeMultiplier * rewardPoolMultiplier;
  
  let totalPaid = 0;
  let totalRewardsEarned = 0;
  const monthlyBreakdown: SimulationResults['monthlyBreakdown'] = [];

  // For each month in the simulation
  for (let month = 0; month < config.months; month++) {
    // Calculate number of subscribers for this month using compound growth
    const subscribers = config.initialSubscribers * Math.pow(1 + monthlyGrowthRate, month);
    
    // Calculate reward curve multiplier
    const monthsPassed = month;
    let multiplier = 1;
    if (monthsPassed >= config.months) {
      multiplier = config.minMultiplier;
    } else {
      multiplier = Math.pow(config.formulaBase, config.months - monthsPassed);
      if (multiplier < config.minMultiplier) multiplier = config.minMultiplier;
    }

    // Calculate total reward pool for the month
    const totalRewardPool = subscribers * monthlyRewardPoolContribution;
    
    // Calculate rewards for our hypothetical subscriber if they're active
    const isSubscribed = month >= config.subscriberStartMonth && 
                        month < (config.subscriberStartMonth + config.subscriberMonths);
    
    let monthlyReward = 0;
    if (isSubscribed) {
      // Add subscription payment to total paid
      totalPaid += config.monthlyFeeUSD;
      
      // Calculate share of reward pool based on their multiplier relative to total weighted shares
      const individualShare = multiplier / (subscribers * multiplier);
      monthlyReward = totalRewardPool * individualShare;
      totalRewardsEarned += monthlyReward;
    }

    monthlyBreakdown.push({
      month,
      subscribers: Math.round(subscribers),
      rewardPoolContribution: monthlyRewardPoolContribution,
      multiplier,
      rewardsEarned: monthlyReward
    });
  }

  const roi = ((totalRewardsEarned - totalPaid) / totalPaid) * 100;

  return {
    totalPaid,
    totalRewardsEarned,
    roi,
    monthlyBreakdown
  };
}

// Example usage with 10x annual growth
const results = calculateRewards({
  ...DEFAULT_CONFIG,
  monthlyFeeUSD: 5,
  rewardPoolBasisPoints: 2000, // 20%
  initialSubscribers: 100,
  annualGrowthRate: 10, // 10x growth per year
  months: 24,
  subscriberMonths: 24
});

console.log('\nGrowth and Economics Summary:');
console.log('Initial Subscribers:', results.monthlyBreakdown[0].subscribers);
console.log('Final Subscribers:', results.monthlyBreakdown[results.monthlyBreakdown.length-1].subscribers);
console.log(`Total Paid: $${results.totalPaid.toFixed(2)}`);
console.log(`Total Rewards Earned: $${results.totalRewardsEarned.toFixed(2)}`);
console.log(`ROI: ${results.roi.toFixed(2)}%`);

console.log('\nDetailed Monthly Breakdown (first 12 months):');
results.monthlyBreakdown.slice(0, 12).forEach(month => {
  console.log(`Month ${month.month}: ${month.subscribers} subs, ${month.multiplier.toFixed(2)}x multiplier, $${month.rewardsEarned.toFixed(2)} earned`);
});