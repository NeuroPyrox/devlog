// The input is a 95% confidence interval
const gaussian = (low, high) => {
  const nSamples = 10;
  const uniformVariance = 1 / 12;
  const sumVariance = uniformVariance * nSamples;
  const sum =
    [...Array(nSamples)].reduce((x) => x + Math.random(), 0) - nSamples / 2;
  const average = (low + high) / 2;
  const range = high - low;
  return average + (sum * range) / (4 * sumVariance ** 0.5);
};

const model = () => {
  const workRoi = gaussian(1.04, 1.5);
  const lifeExpectancy = gaussian(50, 120);
  const productivity = gaussian(0.05, 0.9);
  return workRoi ** (lifeExpectancy * productivity);
};

export default () => [...Array(100)].map(() => model());
