// Sink:         switch mapWeakParents isFirstParent forEachParent getPriority removeFromParents
// EventSink:    switch                                                                          activate deactivate pushValue push
//   Input:                                                                                                          pushValue
//   Middle:                                                                                                                   push
//   Output:                                                                                     activate deactivate           push
// BehaviorSink:                                                                                                     pushValue push
//   Input:                                                                                                          pushValue
//   Else:                                                                                                                     push
