import { assert, ShrinkingList, derefMany, memoize, nothing } from "./util.js";
import * as Push from "./push.js";

// This is an unused file with some ideas on how to refactor and optimize muxes and demuxes.
// I've decided to leave this file alone until performance problems become visible.

// Event interfaces:
// Never                                                               getPriority                        recursivelyWait recursivelyUnwait
// Input                                                               getPriority iterateWaitingChildren recursivelyWait recursivelyUnwait destroy
// Output           addParents removeParents readParents forEachParent getPriority iterateWaitingChildren recursivelyWait recursivelyUnwait destroy push
// Map              addParents removeParents readParents forEachParent getPriority iterateWaitingChildren recursivelyWait recursivelyUnwait destroy push
// Filter           addParents removeParents readParents forEachParent getPriority iterateWaitingChildren recursivelyWait recursivelyUnwait destroy push
// Merge            addParents removeParents readParents forEachParent getPriority iterateWaitingChildren recursivelyWait recursivelyUnwait destroy push
// SwitchModulator  addParents removeParents readParents forEachParent getPriority                        recursivelyWait recursivelyUnwait destroy push
// StepperModulator addParents removeParents readParents forEachParent getPriority                        recursivelyWait recursivelyUnwait destroy push
// SwitchModulatee  addParents removeParents readParents forEachParent getPriority iterateWaitingChildren recursivelyWait recursivelyUnwait destroy push switchPriority
// MuxParent        addParents removeParents readParents forEachParent getPriority iterateWaitingChildren recursivelyWait recursitelyUnwait destroy push
// MuxChild         addParents removeParents             forEachParent getPriority iterateWaitingChildren recursivelyWait recursivelyUnwait destroy push
// DemuxParent      addParents removeParents readParents forEachParent getPriority                        recursivelyWait recursivelyUnwait destroy push
// DemuxChild                                                          getPriority iterateWaitingChildren recursivelyWait recursivelyUnwait destroy
// Behavior interfaces:
// StepperModulatee                                                    getPriority iterateWaitingChildren
// Map              addParents removeParents readParents forEachParent getPriority iterateWaitingChildren            wait            unwait destroy push
// Apply            addParents removeParents readParents forEachParent getPriority iterateWaitingChildren            wait            unwait destroy push

const finalizers = new FinalizationRegistry((f) => f());

class Sink {
  // These 3 variables interact with each other a lot.
  #parentsInfo;
  #childrenInfo;
  // This variable is largely independent of the other ones,
  // but refactoring it into its own class would expose more methods.
  #priority;

  constructor(weakParents) {
    this.#parentsInfo = new ShrinkingList();
    this.#childrenInfo = new ShrinkingList();
    this.#priority =
      Math.max(
        -1,
        ...derefMany(weakParents).map((parent) => parent.getPriority())
      ) + 1;
    this.addWeakParents(weakParents);
  }

  addWeakParents(weakParents) {
    for (const weakParent in weakParents) {
      if (weakParent.deref() !== undefined) {
        const childInfo = parent.#childrenInfo.add({ ref: this });
        const parentInfo = this.#parentsInfo.add({
          weakRef: weakParent,
          weakRemover: new WeakRef(childInfo),
        });
        // TODO explain why some finalizers don't block other finalizers.
        finalizers.register(childInfo, () =>
          parentInfo.removeOnce()
        );
      }
    }
  }

  getPriority() {
    return this.#priority;
  }
}
