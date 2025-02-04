interface SimulationResults {
  totalPaid: number;
  totalRewardsEarned: number;
  totalClientFees: number;
  totalCreatorEarnings: number; // Added this field
  roi: number;
  monthlyBreakdown: Array<{
    month: number;
    subscribers: number;
    rewardPoolContribution: number;
    multiplier: number;
    monthlyReward: number;
    totalRewardPool: number;
    clientFees: number;
    creatorEarnings: number; // Added this field
  }>;
}

const DEFAULT_CONFIG = {
  monthlyFeeUSD: 5,
  rewardPoolBasisPoints: 2000, // 20%
  clientFeeBasisPoints: 500, // 5%
  protocolFeeBasisPoints: 100, // 1%
  initialSubscribers: 30,
  annualGrowthRate: 3,
  months: 60, // 5 years
  decayRate: 1.5,
  minMultiplier: 0,
  subscriberStartMonth: 0,
  subscriberMonths: 60,
  paymentMultiplier: 1, // How many times the base fee our subscriber pays
  avgPaymentMultiplier: 1.2, // Average payment multiplier across all subscribers
};

export const formatCurrency = (num: number, decimals: number = 2) => {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  }).format(num);
};

function calculateMonthlyGrowthRate(annualMultiplier: number): number {
  return Math.pow(annualMultiplier, 1 / 12) - 1;
}

function calculateRewards(config = DEFAULT_CONFIG): SimulationResults {
  const monthlyGrowthRate = calculateMonthlyGrowthRate(config.annualGrowthRate);
  const MAX_BPS = 10000;

  // Calculate portion of subscription that goes to reward pool after fees
  const feeMultiplier =
    (MAX_BPS - config.clientFeeBasisPoints - config.protocolFeeBasisPoints) /
    MAX_BPS;
  const rewardPoolMultiplier = config.rewardPoolBasisPoints / MAX_BPS;
  const clientFeeMultiplier = config.clientFeeBasisPoints / MAX_BPS;

  // Calculate creator's base earnings multiplier (what's left after all fees and reward pool)
  const creatorEarningsMultiplier =
    (MAX_BPS -
      config.rewardPoolBasisPoints -
      config.clientFeeBasisPoints -
      config.protocolFeeBasisPoints) /
    MAX_BPS;

  // Base contribution for minimum payment
  const baseRewardPoolContribution =
    config.monthlyFeeUSD * feeMultiplier * rewardPoolMultiplier;

  let totalPaid = 0;
  let totalRewardsEarned = 0;
  let totalClientFees = 0;
  let totalCreatorEarnings = 0;
  const monthlyBreakdown: SimulationResults["monthlyBreakdown"] = [];

  // For each month in the simulation
  for (let month = 0; month < config.months; month++) {
    // Calculate number of subscribers for this month using compound growth
    const subscribers =
      config.initialSubscribers * Math.pow(1 + monthlyGrowthRate, month);

    // Calculate reward curve multiplier
    const monthsPassed = month;
    let multiplier = 1;
    if (monthsPassed >= config.months) {
      multiplier = config.minMultiplier;
    } else {
      multiplier = Math.pow(config.decayRate, config.months - monthsPassed);
      if (multiplier < config.minMultiplier) multiplier = config.minMultiplier;
    }

    // Our subscriber's monthly contribution based on their payment multiplier
    const ourMonthlyContribution =
      baseRewardPoolContribution * config.paymentMultiplier;

    // Calculate average contribution per subscriber (excluding our subscriber)
    const avgContribution =
      baseRewardPoolContribution * config.avgPaymentMultiplier;

    // Calculate total reward pool for the month, accounting for variable payments
    const totalRewardPool =
      (subscribers - 1) * avgContribution + // All other subscribers
      ourMonthlyContribution; // Our subscriber

    // Calculate client fees for all subscribers
    const monthlyClientFees =
      subscribers * config.monthlyFeeUSD * clientFeeMultiplier;
    totalClientFees += monthlyClientFees;

    // Calculate creator's monthly earnings (before rewards)
    const monthlyCreatorEarnings =
      subscribers * config.monthlyFeeUSD * creatorEarningsMultiplier;
    totalCreatorEarnings += monthlyCreatorEarnings;

    // Add our subscription payment to total paid
    totalPaid += config.monthlyFeeUSD * config.paymentMultiplier;

    // Calculate total weighted shares, accounting for payment amounts
    const totalWeightedShares =
      (subscribers - 1) * config.avgPaymentMultiplier + // Other subscribers' weighted shares
      multiplier * config.paymentMultiplier; // Our subscriber's weighted shares

    // Calculate share of reward pool based on weighted shares and payment amount
    const individualShare =
      (multiplier * config.paymentMultiplier) / totalWeightedShares;
    const monthlyReward = totalRewardPool * individualShare;
    totalRewardsEarned += monthlyReward;

    monthlyBreakdown.push({
      month,
      subscribers: Math.round(subscribers),
      rewardPoolContribution: ourMonthlyContribution,
      multiplier,
      monthlyReward,
      totalRewardPool,
      clientFees: monthlyClientFees,
      creatorEarnings: monthlyCreatorEarnings,
    });
  }

  const roi = ((totalRewardsEarned - totalPaid) / totalPaid) * 100;

  return {
    totalPaid,
    totalRewardsEarned,
    totalClientFees,
    totalCreatorEarnings,
    roi,
    monthlyBreakdown,
  };
}

// Example usage showing different payment scenarios
console.log("\n=== Baseline (1x payment) ===");
const baseResults = calculateRewards({
  ...DEFAULT_CONFIG,
  paymentMultiplier: 1,
});

console.log(`ROI: ${baseResults.roi.toFixed(2)}%`);
console.log(
  `Total Client Fees: $${formatCurrency(baseResults.totalClientFees)}`
);
console.log(
  `Total Creator Earnings: $${formatCurrency(baseResults.totalCreatorEarnings)}`
);
console.log(
  `Monthly reward (first month): $${baseResults.monthlyBreakdown[0].monthlyReward.toFixed(
    2
  )}`
);

console.log("\n=== 2x Payment ===");
const doubleResults = calculateRewards({
  ...DEFAULT_CONFIG,
  paymentMultiplier: 2,
});

console.log(`Total paid: $${formatCurrency(doubleResults.totalPaid)}`);
console.log(
  `Total Client Fees: $${formatCurrency(doubleResults.totalClientFees)}`
);
console.log(
  `Total Creator Earnings: $${formatCurrency(
    doubleResults.totalCreatorEarnings
  )}`
);
console.log(`ROI: ${doubleResults.roi.toFixed(2)}%`);
console.log(
  `Total rewards earned: $${formatCurrency(doubleResults.totalRewardsEarned)}`
);

console.log("\n=== 5x Payment ===");
const fiveXResults = calculateRewards({
  ...DEFAULT_CONFIG,
  paymentMultiplier: 5,
});

console.log(`Total paid: $${formatCurrency(fiveXResults.totalPaid)}`);
console.log(
  `Total Client Fees: $${formatCurrency(fiveXResults.totalClientFees)}`
);
console.log(
  `Total Creator Earnings: $${formatCurrency(
    fiveXResults.totalCreatorEarnings
  )}`
);
console.log(`ROI: ${fiveXResults.roi.toFixed(2)}%`);
console.log(
  `Total rewards earned: $${formatCurrency(fiveXResults.totalRewardsEarned)}`
);

console.log("\nDetailed Monthly Breakdown (all months with 5x payment):");
console.log(
  "\nMonth | Subscribers | Reward Pool | Multiplier | Rewards Earned | Client Fees | Creator Earnings"
);
console.log(
  "-------|-------------|--------------|------------|----------------|-------------|----------------"
);
fiveXResults.monthlyBreakdown.forEach((month) => {
  console.log(
    `${month.month.toString().padStart(5)} | ` +
      `${month.subscribers.toLocaleString().padEnd(11)} | ` +
      `${formatCurrency(month.totalRewardPool).padEnd(10)} | ` +
      `${month.multiplier.toFixed(2).padEnd(10)} | ` +
      `${formatCurrency(month.monthlyReward).padEnd(12)} | ` +
      `${formatCurrency(month.clientFees).padEnd(9)} | ` +
      `${formatCurrency(month.creatorEarnings)}`
  );
});
