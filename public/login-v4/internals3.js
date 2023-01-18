import { assert, ShrinkingList, derefMany, memoize, nothing } from "./util.js";
import * as Push from "./push.js";

// TODO define interfaces

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
    if (this.weakParentsChildRemovers) {
      for (const weakChildRemover of this.weakParentsChildRemovers) {
        weakChildRemover.deref()?.removeOnce();
      }
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
