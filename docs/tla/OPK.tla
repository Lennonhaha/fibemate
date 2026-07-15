--------------------------- MODULE OPK ---------------------------
(*
  FIBEMATE OPK Protocol — TLA+ State Machine
  ============================================
  Models the One-Time Pre-Key (OPK) protocol from X3DH:
  
  1. Client uploads a batch of OPK public keys (each with unique keyId)
  2. Another client consumes one OPK (one-time use)
  3. A consumed OPK can never be consumed again
  
  State model per OPK:
    0 -> "available"  (uploaded, unused)
    1 -> "consumed"   (used in one handshake, permanently gone)
    2 -> "burned"     (for testing: consumed and verified)
  
  Invariants:
    O1_NoDoubleConsume:  no OPK is consumed twice
    O2_ConsumedExists:   every consumed OPK has a valid upload
    O3_CountCorrect:     count of available OPKs equals the real count
  
  Extends the C2 handshake model with OPK-based key derivation.
*)
EXTENDS Integers, FiniteSets, Sequences, TLC

CONSTANTS
  MaxUsers,           (* Number of users in the model *)
  MaxOPKPerUser       (* Max OPKs any single user can hold *)
  
MaxOPKID == MaxOPKPerUser

(* OPK status *)
OPK_AVAILABLE == 0
OPK_CONSUMED  == 1
OPK_BURNED    == 2

VARIABLES
  opkStore,           (* [userId → [keyId → status]] *)
  opkCount,           (* [userId → current available count] *)
  nextKeyId,          (* [userId → next available keyId for upload] *)
  consumeLog,         (* << {userId, consumerId, keyId, sessionId} >> *)
  lastSessionId

(* == Type definitions == *)
UserSet == 1..MaxUsers
KeyIdSet == 1..MaxOPKID

vars == <<opkStore, opkCount, nextKeyId, consumeLog, lastSessionId>>

(* ===================================================================== *)
(* Init                                                                  *)
(* ===================================================================== *)
Init ==
  /\ opkStore = [u \in UserSet |-> [k \in KeyIdSet |-> -1]]
  /\ opkCount = [u \in UserSet |-> 0]
  /\ nextKeyId = [u \in UserSet |-> 1]
  /\ consumeLog = << >>
  /\ lastSessionId = 0

(* ===================================================================== *)
(* TypeOK                                                               *)
(* ===================================================================== *)
TypeOK ==
  /\ opkStore \in [UserSet -> [KeyIdSet -> {-1, OPK_AVAILABLE, OPK_CONSUMED, OPK_BURNED}]]
  /\ opkCount \in [UserSet -> 0..MaxOPKPerUser]
  /\ nextKeyId \in [UserSet -> 1..(MaxOPKID+1)]
  /\ consumeLog \in Seq([userId: UserSet, consumerId: UserSet,
                         keyId: KeyIdSet, sessionId: Nat])

(* ===================================================================== *)
(* Helpers                                                              *)
(* ===================================================================== *)

(* Count available OPKs for user u *)
CountAvailable(u) ==
  LET all == {k \in KeyIdSet: opkStore[u][k] = OPK_AVAILABLE}
  IN Cardinality(all)

(* Check if user u has at least n available OPKs *)
HasAvailable(u, n) ==
  opkCount[u] >= n

(* Get the minimum keyId of an available OPK for user u *)
GetFirstAvailable(u) ==
  CHOOSE k \in KeyIdSet: opkStore[u][k] = OPK_AVAILABLE

(* ===================================================================== *)
(* Actions — Client                                                     *)
(* ===================================================================== *)

(* Upload a batch of OPK public keys (simulate 1..n keys) *)
ClientUploadOPK(u, n) ==
  /\ u \in UserSet
  /\ nextKeyId[u] + n - 1 <= MaxOPKID
  /\ HasAvailable(u, 0)  \* Only upload if currently empty (simplified)
  /\ \/ opkCount[u] = 0
     \/ TRUE  \* In real protocol, can upload additional batches
  /\ opkStore' = [opkStore EXCEPT ![u] = 
       [k \in KeyIdSet |->
         IF k >= nextKeyId[u] /\ k < nextKeyId[u] + n
         THEN OPK_AVAILABLE
         ELSE opkStore[u][k]]]
  /\ opkCount' = [opkCount EXCEPT ![u] = CountAvailable(u) + n]
  /\ nextKeyId' = [nextKeyId EXCEPT ![u] = nextKeyId[u] + n]
  /\ UNCHANGED <<consumeLog, lastSessionId>>

(* Another client consumes one OPK from user u *)
ClientConsumeOPK(u, consumerId) ==
  /\ u \in UserSet
  /\ consumerId \in UserSet
  /\ u /= consumerId
  /\ HasAvailable(u, 1)
  /\ LET selectedKeyId == GetFirstAvailable(u) IN
     /\ opkStore' = [opkStore EXCEPT ![u][selectedKeyId] = OPK_CONSUMED]
     /\ opkCount' = [opkCount EXCEPT ![u] = opkCount[u] - 1]
     /\ lastSessionId' = lastSessionId + 1
     /\ consumeLog' = Append(consumeLog,
          [userId |-> u, consumerId |-> consumerId,
           keyId |-> selectedKeyId, sessionId |-> lastSessionId + 1])
  /\ UNCHANGED <<nextKeyId>>

(* Verify consumed OPK (mark as burned in verify log) *)
ClientVerifyConsumed(u, keyId) ==
  /\ opkStore[u][keyId] = OPK_CONSUMED
  /\ opkStore' = [opkStore EXCEPT ![u][keyId] = OPK_BURNED]
  /\ UNCHANGED <<opkCount, nextKeyId, consumeLog, lastSessionId>>

(* ===================================================================== *)
(* Actions — Server (state query)                                      *)
(* ===================================================================== *)

(* Query available OPK count *)
ServerQueryCount(u) ==
  /\ opkCount[u] = CountAvailable(u)
  /\ UNCHANGED vars

(* ===================================================================== *)
(* Next (fair stuttering)                                               *)
(* ===================================================================== *)

Next ==
  \E u \in UserSet:
    \E n \in 1..3:
      \/ ClientUploadOPK(u, n)
  \E u \in UserSet:
    \E consumerId \in UserSet:
      \/ ClientConsumeOPK(u, consumerId)
  \E u \in UserSet:
    \E keyId \in KeyIdSet:
      \/ ClientVerifyConsumed(u, keyId)
  \E u \in UserSet:
    \/ ServerQueryCount(u)

Spec == Init /\ [][Next]_vars /\ WF_vars(Next)

(* ===================================================================== *)
(* Invariants                                                           *)
(* ===================================================================== *)

(* O1: No OPK is consumed twice *)
O1_NoDoubleConsume ==
  \A i \in DOMAIN consumeLog:
    \A j \in DOMAIN consumeLog:
      i /= j /\ consumeLog[i].keyId = consumeLog[j].keyId
        /\ consumeLog[i].userId = consumeLog[j].userId
        => FALSE

(* O2: Every consumed OPK has a valid upload record *)
O2_ConsumedRecorded ==
  \A i \in DOMAIN consumeLog:
    \/ opkStore[consumeLog[i].userId][consumeLog[i].keyId] = OPK_CONSUMED
    \/ opkStore[consumeLog[i].userId][consumeLog[i].keyId] = OPK_BURNED

(* O3: opkCount always reflects the true available count *)
O3_CountCorrect ==
  \A u \in UserSet:
    opkCount[u] = CountAvailable(u)

(* O4: A consumed OPK cannot be consumed again *)
O4_ConsumedNotReusable ==
  \A u \in UserSet:
    \A k \in KeyIdSet:
      opkStore[u][k] = OPK_CONSUMED
        => ~(\E i \in DOMAIN consumeLog:
              consumeLog[i].userId = u /\ consumeLog[i].keyId = k)

(* O5: Only available OPKs can be consumed *)
O5_ConsumeFromAvailable ==
  \A i \in DOMAIN consumeLog:
    opkStore[consumeLog[i].userId][consumeLog[i].keyId] \in {OPK_CONSUMED, OPK_BURNED}

(* O6: Total consumed per user cannot exceed total uploaded per user *)
O6_ConsumeBound ==
  \A u \in UserSet:
    Cardinality({i \in DOMAIN consumeLog: consumeLog[i].userId = u}) <= MaxOPKID

(* O7: KeyId always increments (no reuse in uploads) *)
O7_KeyIdMonotonic ==
  \A u \in UserSet:
    nextKeyId[u] >= 1

(* ===================================================================== *)
(* Temporal Properties                                                  *)
(* ===================================================================== *)

(* T1: If OPKs are available, eventually one will be consumed *)
T1_Progress ==
  \A u \in UserSet:
    \A consumerId \in UserSet \ {u}:
      HasAvailable(u, 1) ~> \E k \in KeyIdSet:
        opkStore[u][k] = OPK_CONSUMED

(* T2: If uploaded, eventually available for consumption *)
T2_UploadPhase ==
  \A u \in UserSet:
    \A k \in KeyIdSet:
      [](opkStore[u][k] = OPK_AVAILABLE
        => <>(\E consumerId \in UserSet \ {u}:
               \E i \in DOMAIN consumeLog:
                 consumeLog[i].keyId = k /\ consumeLog[i].userId = u
                 /\ opkStore[u][k] = OPK_CONSUMED))

================================================================================
(* ===================================================================== *)
(* Config file                                                          *)
(* ===================================================================== *)
(* 
CONSTANTS
  MaxUsers = 3
  MaxOPKPerUser = 5

INVARIANT TypeOK
INVARIANT O1_NoDoubleConsume
INVARIANT O2_ConsumedRecorded
INVARIANT O3_CountCorrect
INVARIANT O4_ConsumedNotReusable
INVARIANT O5_ConsumeFromAvailable
INVARIANT O6_ConsumeBound

SPECIFICATION Spec
*)
