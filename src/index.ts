import { formatNum } from "./helpers";

// Types remain the same as before
interface TierConfig {
  rewardBasisPoints: number;
  initialMintPrice: number;
  pricePerPeriod: number;
}

interface CurveConfig {
  numPeriods: number;
  formulaBase: number;
  startTimestamp: number;
  minMultiplier: number;
}

interface FeeConfig {
  protocolBps: number;
  clientBps: number;
}

interface Subscriber {
  tierId: number;
  subscriptionStart: number;
  expiresAt: number;
  rewardShares: number;
  totalSpent: number;
}

interface SimulationResult {
  month: number;
  subscribers: number;
  avgRoi: number;
  creatorEarnings: number;
  clientEarnings: number;
  protocolEarnings: number;
  subscriberRewards: number;
  testSubscriberRoi?: number;
}

interface SubscriptionState {
  subscribers: Map<string, Subscriber>;
  rewardPool: number;
  totalShares: number;
  creatorBalance: number;
  protocolEarnings: number;
  clientEarnings: number;
}

const ONE_YEAR_DAYS = 365;
const ONE_MONTH_DAYS = 30;
const ONE_MONTH_SECONDS = ONE_MONTH_DAYS * 24 * 60 * 60;
const MAX_BPS = 10_000;
const AVG_SUB_MONTHS = 12;
const INITIAL_SUBSCRIBERS = 50;

class SubscriptionModel {
  public state: SubscriptionState;
  private tier: TierConfig;
  private curve: CurveConfig;
  private fees: FeeConfig;

  constructor(tier: TierConfig, curve: CurveConfig, fees: FeeConfig) {
    this.tier = tier;
    this.curve = curve;
    this.fees = fees;

    this.state = this.getInitialState();
  }

  private getInitialState(): SubscriptionState {
    return {
      subscribers: new Map(),
      rewardPool: 0,
      totalShares: 0,
      creatorBalance: 0,
      protocolEarnings: 0,
      clientEarnings: 0,
    };
  }

  private calculateMultiplier(timestamp: number): number {
    const periodsElapsed = Math.floor(
      (timestamp - this.curve.startTimestamp) / ONE_MONTH_SECONDS
    );

    if (periodsElapsed >= this.curve.numPeriods) {
      return this.curve.minMultiplier;
    }

    const multiplier = Math.pow(
      this.curve.formulaBase,
      this.curve.numPeriods - periodsElapsed
    );

    return Math.max(multiplier, this.curve.minMultiplier);
  }

  public addSubscriber({
    address,
    timestamp,
    subscriptionDays,
  }: {
    address: string;
    timestamp: number;
    subscriptionDays: number;
  }): void {
    const subscriptionMonths = subscriptionDays / ONE_MONTH_DAYS;
    const subscriptionSeconds = subscriptionMonths * ONE_MONTH_SECONDS;
    const payment =
      this.tier.initialMintPrice +
      subscriptionMonths * this.tier.pricePerPeriod; // Fix: Calculate payment based on months, not seconds

    const protocolFee = (payment * this.fees.protocolBps) / MAX_BPS;
    const clientFee = (payment * this.fees.clientBps) / MAX_BPS;
    const netPayment = payment - protocolFee - clientFee;

    const rewardAmount = (netPayment * this.tier.rewardBasisPoints) / MAX_BPS;
    const multiplier = this.calculateMultiplier(timestamp);
    // Scale shares by subscription length to reward longer subscriptions
    const shares = rewardAmount * multiplier * (subscriptionMonths / 12);

    this.state.subscribers.set(address, {
      tierId: 1,
      subscriptionStart: timestamp,
      expiresAt: timestamp + subscriptionSeconds,
      rewardShares: shares,
      totalSpent: payment,
    });

    this.state.totalShares += shares;
    this.state.rewardPool += rewardAmount;
    this.state.creatorBalance += netPayment - rewardAmount;
    this.state.protocolEarnings += protocolFee;
    this.state.clientEarnings += clientFee;
  }

  public calculateRewards(address: string, currentTimestamp: number): number {
    const subscriber = this.state.subscribers.get(address);
    if (!subscriber) return 0;

    // Still calculate rewards even if expired - they earned them during their subscription
    // Only check if the subscription hasn't started yet
    if (currentTimestamp < subscriber.subscriptionStart) {
      return 0;
    }

    const sharePercentage = subscriber.rewardShares / this.state.totalShares;
    const totalRewards = this.state.rewardPool * sharePercentage;
    return totalRewards;
  }

  public calculateROI(address: string, currentTimestamp: number) {
    const subscriber = this.state.subscribers.get(address);
    if (!subscriber)
      return {
        roi: 0,
        spent: 0,
        rewards: 0,
      };

    const rewards = this.calculateRewards(address, currentTimestamp);
    // ROI calculation was incorrect - should be (rewards/spent - 1) * 100
    // But we were calculating ((rewards/spent) * 100) - 1
    return {
      roi: (rewards / subscriber.totalSpent - 1) * 100,
      spent: subscriber.totalSpent,
      rewards,
    };
  }

  public simulateScenario({
    startTimestamp,
    months,
    monthlyGrowthRate,
    testSubscriptionDays,
  }: {
    startTimestamp: number;
    months: number;
    monthlyGrowthRate: number;
    testSubscriptionDays: number;
  }): SimulationResult[] {
    // Reset state for fresh simulation
    this.state = this.getInitialState();

    // Add initial subscribers
    for (let i = 0; i < INITIAL_SUBSCRIBERS; i++) {
      this.addSubscriber({
        address: `subscriber-${i + 1}`,
        timestamp: startTimestamp,
        subscriptionDays: AVG_SUB_MONTHS * ONE_MONTH_DAYS,
      });
    }

    // Add test subscriber at the start
    const testAddress = "test-subscriber";
    this.addSubscriber({
      address: testAddress,
      timestamp: startTimestamp,
      subscriptionDays: testSubscriptionDays,
    });

    const results: SimulationResult[] = [];
    let currentSubs = this.state.subscribers.size;

    for (let month = 1; month <= months; month++) {
      const timestamp = startTimestamp + month * ONE_MONTH_SECONDS;
      const newSubs = Math.floor(currentSubs * monthlyGrowthRate);

      // Add new subscribers
      for (let i = 0; i < newSubs; i++) {
        this.addSubscriber({
          address: `subscriber-${this.state.subscribers.size + 1}`,
          timestamp,
          subscriptionDays: AVG_SUB_MONTHS * ONE_MONTH_DAYS,
        });
      }

      // Calculate metrics
      let totalRoi = 0;
      let totalRewards = 0;
      this.state.subscribers.forEach((_, address) => {
        if (address !== testAddress) {
          // Exclude test subscriber from averages
          const analysis = this.calculateROI(address, timestamp);
          totalRoi += analysis.roi;
          totalRewards += analysis.rewards;
        }
      });

      const regularSubCount = this.state.subscribers.size - 1; // Exclude test subscriber
      const testAnalysis = this.calculateROI(testAddress, timestamp);

      // Calculate total rewards including test subscriber
      const testRewards = this.calculateRewards(testAddress, timestamp);
      const totalPoolRewards = totalRewards + testRewards;

      results.push({
        month,
        subscribers: regularSubCount,
        avgRoi: totalRoi / regularSubCount,
        creatorEarnings: this.state.creatorBalance,
        clientEarnings: this.state.clientEarnings,
        protocolEarnings: this.state.protocolEarnings,
        subscriberRewards: totalPoolRewards, // Include all rewards
        testSubscriberRoi: testAnalysis.roi,
      });

      currentSubs = regularSubCount;
    }

    return results;
  }
}

// Initialize model with same parameters
const startTime = Math.floor(Date.now() / 1000);

const tier: TierConfig = {
  rewardBasisPoints: 2_000, // 20%
  initialMintPrice: 0,
  pricePerPeriod: 5,
};

const curve: CurveConfig = {
  numPeriods: 60,
  formulaBase: 1.2,
  startTimestamp: startTime,
  minMultiplier: 0,
};

const fees: FeeConfig = {
  protocolBps: 100, // 1%
  clientBps: 500, // 5%
};

// Initialize model
const model = new SubscriptionModel(tier, curve, fees);

// Test different subscription lengths
const subscriptionLengths = [
  60, // 2 months
  180, // 6 months
  ONE_YEAR_DAYS, // 1 year
  ONE_YEAR_DAYS * 2, // 2 years
  ONE_YEAR_DAYS * 25, // Simulate yolo investment
];

// Run simulations for each scenario
console.log("\nAnalyzing scenarios with different subscription lengths:");
subscriptionLengths.forEach((days) => {
  const results = model.simulateScenario({
    startTimestamp: startTime,
    months: curve.numPeriods,
    monthlyGrowthRate: 0.15,
    testSubscriptionDays: days,
  });

  // Output final month results
  const finalResult = results[results.length - 1];
  const testSub = model.state.subscribers.get("test-subscriber");
  console.log(`\n${days} day subscription scenario:`);
  console.log(
    `- Final subscriber count: ${formatNum(finalResult.subscribers)}`
  );
  console.log(
    `- Average ROI for regular subscribers: ${formatNum(finalResult.avgRoi)}%`
  );
  console.log(
    `- Test subscriber spent: $${formatNum(testSub?.totalSpent || 0)}`
  );
  console.log(
    `- Test subscriber shares: ${formatNum(testSub?.rewardShares || 0)}`
  );
  console.log(
    `- Test subscriber rewards: $${formatNum(
      model.calculateRewards(
        "test-subscriber",
        startTime + curve.numPeriods * ONE_MONTH_SECONDS
      )
    )}`
  );
  console.log(
    `- Test subscriber ROI: ${formatNum(finalResult.testSubscriberRoi!)}%`
  );
  console.log(`- Creator earnings: $${formatNum(finalResult.creatorEarnings)}`);
  console.log(
    `- Total subscriber rewards: $${formatNum(finalResult.subscriberRewards)}`
  );
});
