import { assert, ShrinkingList, derefMany, memoize, nothing } from "./util.js";
import * as Push from "./push.js";

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

const finalizers = new FinalizationRegistry(f => f());

class Sink {
  // These 3 variables interact with each other a lot.
  #parents;
  #weakParentLinks;
  #children;
  // This variable is largely independent of the other ones,
  // but refactoring it into its own class would expose more methods.
  #priority;
  
  constructor(weakParents) {
    this.#parentInfo = new ShrinkingList();
    this.#childInfo = new ShrinkingList();
    this.#weakParentLinks = [];
    this.#priority =
      Math.max(
        -1,
        ...derefMany(weakParents).map((parent) => parent.getPriority())
      ) + 1;
    this.addWeakParents(weakParents);
  }

  // TODO how to handle merges?
  addWeakParents(weakParents) {
    for (const weakParent in weakParents) {
      if (weakParent.deref() !== undefined) {
        const parentInfo = this.#parentInfo.add({weakRef: weakParent});
        const childInfo = parent.#childInfo.add({ref: this});
        parentInfo.get().remover = childInfo;
        childInfo.get().remover = parentInfo;
        // TODO finalizer
      }
    }
  }
  
  getPriority() {
    return this.#priority;
  }
}
