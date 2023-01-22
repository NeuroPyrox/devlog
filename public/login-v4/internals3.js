import { assert, ShrinkingList, derefMany, memoize, nothing } from "./util.js";
import * as Push from "./push.js";

// Never                                                               getPriority                        recursivelyWait recursivelyUnwait
// Input                                                               getPriority iterateWaitingChildren recursivelyWait recursivelyUnwait destroy
// Output           setParents removeParents readParents forEachParent getPriority iterateWaitingChildren recursivelyWait recursivelyUnwait destroy push
// Map              setParents removeParents readParents forEachParent getPriority iterateWaitingChildren recursivelyWait recursivelyUnwait destroy push
// Filter           setParents removeParents readParents forEachParent getPriority iterateWaitingChildren recursivelyWait recursivelyUnwait destroy push
// Merge            setParents removeParents readParents forEachParent getPriority iterateWaitingChildren recursivelyWait recursivelyUnwait destroy push
// SwitchModulator  setParents removeParents readParents forEachParent getPriority                        recursivelyWait recursivelyUnwait destroy push
// StepperModulator setParents removeParents readParents forEachParent getPriority                        recursivelyWait recursivelyUnwait destroy push
// SwitchModulatee  setParents removeParents readParents forEachParent getPriority iterateWaitingChildren recursivelyWait recursivelyUnwait destroy push switchPriority
// DemuxParent      setParents removeParents readParents forEachParent getPriority                        recursivelyWait recursivelyUnwait destroy push
// DemuxChild                                                          getPriority iterateWaitingChildren recursivelyWait recursivelyUnwait destroy
// TODO behavior interfaces

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
