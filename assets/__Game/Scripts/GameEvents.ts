export const GameEvents = {
    NEW_LEVEL: "NEW_LEVEL",
    LEVEL_LOSE: "LEVEL_LOSE",
    LEVEL_WIN: "LEVEL_WIN",
    FISH_CLICKED: "FISH_CLICKED",
    MATCHED: "MATCHED",
    // Fired by an Order once it has a fresh id AND its pop-in animation has fully settled -
    // i.e. the exact moment it's actually safe to route a fish (bench-waiting or freshly
    // clicked) to it. Fired regardless of which path gave it that id (OrderManager.completeOrder
    // resetting it directly, or fillPendingOrders() reactivating a previously-hidden one).
    ORDER_READY: "ORDER_READY",
    // A bubble just left the board for good (popped empty). BubbleManager listens for this to
    // release the next bubble from its spawn queue - Unity's "spawn below the screen once there
    // is room" rule.
    BUBBLE_REMOVED: "BUBBLE_REMOVED",
}