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

class Never {
  getPriority() {
    return 0;
  }
}

class Input {
  constructor(subscribe) {
    this.children = new ShrinkingList();
    this.unsubscribe = subscribe(x => Push.push(this, x));
  }
  
  getPriority() {
    return 0;
  }
  
  *iterateWaitingChildren() {
    yield* this.children;
  }
}

// TODO priority
class Output {
  constructor(weakParent, handle) {
    this.setParents([weakParent]);
  }
  
  setParents(weakParents) {
    for (const weakChildRemover of this.weakParentsChildRemovers ?? []) {
      weakChildRemover.deref()?.removeOnce();
    }
    this.weakParents = weakParents;
    this.weakParentsChildRemovers = derefMany(weakParents).map(
      (parent) => new WeakRef(parent.children.add(this))
    );
  }
  
  unsubscribe() {
    this.setParents([]);
  }
}
