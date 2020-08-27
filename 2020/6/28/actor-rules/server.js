"use strict";

const genIntBetween = (start, stop) => {
  return Math.floor(Math.random() * (stop - start)) + start;
};

const genNumVarRefs = () => genIntBetween(0, 3);
const genNumBehaviorRefs = () => genIntBetween(0, 3);
const genNumSendCommands = () => genIntBetween(0, 3);
const genNumBehaviors = () => genIntBetween(3, 5);

const genLocalRef = (numSelfRefs, numMsgRefs, numVarRefs) => {
  let index = genIntBetween(0, 2 + numSelfRefs + numMsgRefs + numVarRefs);
  if (index === 0) {
    return "self";
  }
  if (index === 1) {
    return "msg";
  }
  index -= 2;
  if (index < numSelfRefs) {
    return `self[${index}]`;
  }
  index -= numSelfRefs;
  if (index < numMsgRefs) {
    return `msg[${index}]`;
  }
  index -= numMsgRefs;
  return `var[${index}]`;
};

const genNewCommand = (
  localRefGen,
  getRandomBehavior,
  getNumBehaviorRefs,
  varIndex
) => {
  const behavior = getRandomBehavior();
  const numRefs = getNumBehaviorRefs(behavior);
  const args = Array.from({ length: numRefs }, localRefGen);
  return `var[${varIndex}] = behavior[${behavior}](${args.join(", ")})`;
};

const genSendCommand = localRefGen => {
  const sender = localRefGen();
  const receiver = localRefGen();
  return `${sender}(${receiver})`;
};

const genBecomeCommand = (localRefGen, getRandomBehavior, getNumBehaviorRefs) => {
  const behavior = getRandomBehavior();
  const numRefs = getNumBehaviorRefs(behavior);
  const args = Array.from({ length: numRefs }, localRefGen);
  return `become behavior[${behavior}](${args.join(", ")})`;
};

const genInteractionRule = (
  numSelfRefs,
  numMsgRefs,
  getRandomBehavior,
  getNumBehaviorRefs
) => {
  const numVarRefs = genNumVarRefs();
  const localRefGen = () => genLocalRef(numSelfRefs, numMsgRefs, numVarRefs);
  const newCommands = Array.from({ length: numVarRefs }, (_, varIndex) =>
    genNewCommand(localRefGen, getRandomBehavior, getNumBehaviorRefs, varIndex)
  );
  const sendCommands = Array.from({length: genNumSendCommands()}, () => genSendCommand(localRefGen));
  const becomeCommand = genBecomeCommand(localRefGen, getRandomBehavior, getNumBehaviorRefs);
  return newCommands.concat(sendCommands, [becomeCommand]);
};

const genBehaviorRules = (numSelfRefs, numBehaviors, getNumBehaviorRefs) => {
  const getRandomBehavior = () => genIntBetween(0, numBehaviors);
  return Array.from({length: numBehaviors}, (_, msgIndex) => {
    const numMsgRefs = getNumBehaviorRefs(msgIndex);
    return genInteractionRule(numSelfRefs, numMsgRefs, getRandomBehavior, getNumBehaviorRefs);
  });
}

module.exports = () => {
  const numBehaviors = genNumBehaviors();
  const numBehaviorRefs = Array.from({length: numBehaviors}, genNumBehaviorRefs);
  const getNumBehaviorRefs = behaviorIndex => numBehaviorRefs[behaviorIndex];
  const behaviorRules = Array.from({length: numBehaviors}, (_, selfIndex) => {
    const numSelfRefs = getNumBehaviorRefs(selfIndex);
    return genBehaviorRules(numSelfRefs, numBehaviors, getNumBehaviorRefs);
  });
  return behaviorRules.map((rules, index) => ({size: getNumBehaviorRefs(index), rules: rules}));
}
