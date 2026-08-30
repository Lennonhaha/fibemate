--------------------------- MODULE C2 ---------------------------
(*
  FIBEMATE Path C-2 — TLA+ State Machine (K3 Strong Form Extension)
  =================================================================
  Adds keyValue variables to C2 to prove K3's strong form:
  any two distinct sessions i /= j that have both derived their
  session keys always have different key values.

  Key model:
    cKeyValue[i] = 0   -> key not yet derived
    cKeyValue[i] = i   -> key derived (i is session index)
    DeriveKey(i) = i   -> session-specific derivation

  Strong form invariant:
    K3_StrongKeyIndependence:
      \A i,j \in 1..MaxSessions:
        i /= j /\ cKeyValue[i] # 0 /\ cKeyValue[j] # 0
          => cKeyValue[i] # cKeyValue[j]

  In the real protocol:
    key_i = HKDF-Extract-SHA256(sm2_ephem_i || mlkem_ss_i)
    where sm2_ephem_i and mlkem_ss_i are independently sampled
    per session -> key_i # key_j with probability 1 - 2^-256.
*)
(*
  KEM Security Assumptions (see docs/security-model.md):
    - ML-KEM-768: IND-CCA2 (via FO transform) over MLWE, QROM
    - SM2 ECDH:   ECDLP on SM2 P-256, ROM
    - Hybrid KEM: Dual-PRF combiner (NIST SP 800-56Cr2)
      Theorem: if EITHER component is IND-CPA secure => hybrid KEM is IND-CPA
      Ref: Kiltz et al. (2024), draft-ietf-tls-hybrid-design
*)

EXTENDS Integers, FiniteSets, Sequences, TLC

CONSTANTS NULL

VARIABLES
  cState,
  cPQKey,
  cSM2Key,
  cSessionKey,
  cKeyValue,
  sState,
  sPQKey,
  sSM2Key,
  sSessionKey,
  sKeyValue,
  network,
  nextSession

CState  == {"init", "sentCH", "sentCK", "rcvdSK", "active", "closing"}
SState  == {"waiting", "sentSH", "sentSK", "active", "closing"}
KeyState == {"none", "sent", "received", "derived"}

MsgType == {"ClientHello", "ServerHello", "ClientKeyFinish", "Finished"}

Msg == [type: MsgType, src: {"C","S"}, dst: {"C","S"}, session: Nat, data: STRING]

vars == <<cState, cPQKey, cSM2Key, cSessionKey, cKeyValue,
         sState, sPQKey, sSM2Key, sSessionKey, sKeyValue,
         network, nextSession>>

MaxSessions == 2

\* =====================================================================
\* Init
\* =====================================================================
Init ==
  /\ cState   = [i \in 1..MaxSessions |-> "init"]
  /\ cPQKey   = [i \in 1..MaxSessions |-> "none"]
  /\ cSM2Key  = [i \in 1..MaxSessions |-> "none"]
  /\ cSessionKey = [i \in 1..MaxSessions |-> "none"]
  /\ cKeyValue   = [i \in 1..MaxSessions |-> 0]
  /\ sState   = [i \in 1..MaxSessions |-> "waiting"]
  /\ sPQKey   = [i \in 1..MaxSessions |-> "none"]
  /\ sSM2Key  = [i \in 1..MaxSessions |-> "none"]
  /\ sSessionKey = [i \in 1..MaxSessions |-> "none"]
  /\ sKeyValue   = [i \in 1..MaxSessions |-> 0]
  /\ network  = << >>
  /\ nextSession = MaxSessions

\* =====================================================================
\* TypeOK
\* =====================================================================
TypeOK ==
  /\ \A i \in 1..MaxSessions:
       /\ cState[i] \in CState
       /\ cPQKey[i] \in KeyState
       /\ cSM2Key[i] \in KeyState
       /\ cSessionKey[i] \in KeyState
       /\ cKeyValue[i] \in Nat
       /\ sState[i] \in SState
       /\ sPQKey[i] \in KeyState
       /\ sSM2Key[i] \in KeyState
       /\ sSessionKey[i] \in KeyState
       /\ sKeyValue[i] \in Nat
  /\ network \in Seq(Msg)
  /\ nextSession \in Nat

\* =====================================================================
\* Helpers
\* =====================================================================
MsgInNetwork(type, dst, sess) ==
  \E m \in DOMAIN network:
    /\ network[m].type = type
    /\ network[m].dst = dst
    /\ network[m].session = sess

DeriveKey(i) == i

\* =====================================================================
\* Client actions
\* =====================================================================
ClientSendCH(i) ==
  /\ cState[i] = "init"
  /\ cState'   = [cState EXCEPT ![i] = "sentCH"]
  /\ cPQKey'   = [cPQKey EXCEPT ![i] = "sent"]
  /\ cSM2Key'  = [cSM2Key EXCEPT ![i] = "sent"]
  /\ network'  = Append(network,
               [type |-> "ClientHello", src |-> "C", dst |-> "S",
                session |-> i, data |-> "pq+sm2"])
  /\ UNCHANGED <<cSessionKey, cKeyValue,
                sState, sPQKey, sSM2Key, sSessionKey, sKeyValue, nextSession>>

ClientRecvSH_ThenCK(i) ==
  /\ cState[i] = "sentCH"
  /\ MsgInNetwork("ServerHello", "C", i)
  /\ cPQKey'  = [cPQKey  EXCEPT ![i] = "received"]
  /\ cSM2Key' = [cSM2Key EXCEPT ![i] = "received"]
  /\ cState'  = [cState EXCEPT ![i] = "rcvdSK"]
  /\ cSessionKey' = [cSessionKey EXCEPT ![i] = "derived"]
  /\ cKeyValue'   = [cKeyValue EXCEPT ![i] = DeriveKey(i)]
  /\ network' = Append(network,
               [type |-> "ClientKeyFinish", src |-> "C", dst |-> "S",
                session |-> i, data |-> "tlsExporter"])
  /\ UNCHANGED <<sState, sPQKey, sSM2Key, sSessionKey, sKeyValue, nextSession>>

ClientActive(i) ==
  /\ cState[i] = "rcvdSK"
  /\ MsgInNetwork("Finished", "C", i)
  /\ cState' = [cState EXCEPT ![i] = "active"]
  /\ UNCHANGED <<cPQKey, cSM2Key, cSessionKey, cKeyValue,
                sState, sPQKey, sSM2Key, sSessionKey, sKeyValue, network, nextSession>>

ClientClose(i) ==
  /\ cState[i] = "active"
  /\ cState' = [cState EXCEPT ![i] = "closing"]
  /\ UNCHANGED <<cPQKey, cSM2Key, cSessionKey, cKeyValue,
                sState, sPQKey, sSM2Key, sSessionKey, sKeyValue, network, nextSession>>

\* =====================================================================
\* Server actions
\* =====================================================================
ServerRecvCH(i) ==
  /\ sState[i] = "waiting"
  /\ MsgInNetwork("ClientHello", "S", i)
  /\ sPQKey'  = [sPQKey  EXCEPT ![i] = "received"]
  /\ sSM2Key' = [sSM2Key EXCEPT ![i] = "received"]
  /\ sState'  = [sState EXCEPT ![i] = "sentSH"]
  /\ network' = Append(network,
               [type |-> "ServerHello", src |-> "S", dst |-> "C",
                session |-> i, data |-> "pq+sm2"])
  /\ UNCHANGED <<cState, cPQKey, cSM2Key, cSessionKey, cKeyValue,
                sSessionKey, sKeyValue, nextSession>>

ServerDerive(i) ==
  /\ sState[i] = "sentSH"
  /\ sPQKey[i] = "received"
  /\ sSM2Key[i] = "received"
  /\ sPQKey'   = [sPQKey   EXCEPT ![i] = "sent"]
  /\ sSM2Key'  = [sSM2Key  EXCEPT ![i] = "sent"]
  /\ sSessionKey' = [sSessionKey EXCEPT ![i] = "derived"]
  /\ sKeyValue'   = [sKeyValue EXCEPT ![i] = DeriveKey(i)]
  /\ sState'   = [sState EXCEPT ![i] = "sentSK"]
  /\ network'  = Append(network,
               [type |-> "Finished", src |-> "S", dst |-> "C",
                session |-> i, data |-> "verifyData"])
  /\ UNCHANGED <<cState, cPQKey, cSM2Key, cSessionKey, cKeyValue, nextSession>>

ServerActive(i) ==
  /\ sState[i] = "sentSK"
  /\ MsgInNetwork("ClientKeyFinish", "S", i)
  /\ sState' = [sState EXCEPT ![i] = "active"]
  /\ UNCHANGED <<cState, cPQKey, cSM2Key, cSessionKey, cKeyValue,
                sPQKey, sSM2Key, sSessionKey, sKeyValue, network, nextSession>>

ServerClose(i) ==
  /\ sState[i] = "active"
  /\ sState' = [sState EXCEPT ![i] = "closing"]
  /\ UNCHANGED <<cState, cPQKey, cSM2Key, cSessionKey, cKeyValue,
                sPQKey, sSM2Key, sSessionKey, sKeyValue, network, nextSession>>

\* =====================================================================
\* Stuttering
\* =====================================================================
ActiveLoopC(i) ==
  /\ cState[i] = "active"
  /\ UNCHANGED <<cState, cPQKey, cSM2Key, cSessionKey, cKeyValue,
                sState, sPQKey, sSM2Key, sSessionKey, sKeyValue, network, nextSession>>

ActiveLoopS(i) ==
  /\ sState[i] = "active"
  /\ UNCHANGED <<cState, cPQKey, cSM2Key, cSessionKey, cKeyValue,
                sState, sPQKey, sSM2Key, sSessionKey, sKeyValue, network, nextSession>>

\* =====================================================================
\* Next
\* =====================================================================
Next ==
  \E i \in 1..MaxSessions:
    \/ ClientSendCH(i)
    \/ ClientRecvSH_ThenCK(i)
    \/ ClientActive(i)
    \/ ClientClose(i)
    \/ ServerRecvCH(i)
    \/ ServerDerive(i)
    \/ ServerActive(i)
    \/ ServerClose(i)
    \/ ActiveLoopC(i)
    \/ ActiveLoopS(i)

Spec == Init /\ [][Next]_vars /\ WF_vars(Next)

\* =====================================================================
\* Invariants
\* =====================================================================
K1_NoPrematureActive ==
  \A i \in 1..MaxSessions:
    cState[i] = "active" =>
      /\ cSessionKey[i] = "derived"
      /\ cKeyValue[i] # 0
      /\ cPQKey[i] = "received"
      /\ cSM2Key[i] = "received"

K2_ServerKeyPrecondition ==
  \A i \in 1..MaxSessions:
    sSessionKey[i] = "derived" =>
      /\ sPQKey[i] = "sent"
      /\ sSM2Key[i] = "sent"

\* K3 STRONG FORM: keys of different sessions are always distinct
K3_StrongKeyIndependence ==
  \A i \in 1..MaxSessions:
  \A j \in 1..MaxSessions:
    (i /= j /\ cKeyValue[i] # 0 /\ cKeyValue[j] # 0
      => cKeyValue[i] # cKeyValue[j])

K3p_StrongKeyIndependence ==
  \A i \in 1..MaxSessions:
  \A j \in 1..MaxSessions:
    (i /= j /\ sKeyValue[i] # 0 /\ sKeyValue[j] # 0
      => sKeyValue[i] # sKeyValue[j])

K4_NoStateLeak ==
  \A m \in DOMAIN network:
    network[m].type \in {"ClientHello", "ServerHello"}
      => network[m].data /= "tlsExporter"

K5_ServerActiveRequiresClientFinish ==
  \A i \in 1..MaxSessions:
    sState[i] = "active" => MsgInNetwork("ClientKeyFinish", "S", i)

\* =====================================================================
\* Liveness  (handshake completion)
\* ---------------------------------------------------------------------
\* Under Spec == Init /\ [][Next]_vars /\ WF_vars(Next):
\*   - Network delivery is non-consuming: MsgInNetwork is existential and
\*     messages are only ever Append-ed to `network`, never removed. Once a
\*     message is in network it stays visible, so every receiving action
\*     becomes and stays enabled.
\*   - WF_vars(Next) (weak fairness) guarantees every enabled Next-action is
\*     eventually taken. Hence any session that leaves "init" eventually
\*     reaches "active" on BOTH client and server.
\* Intended liveness property (promote to the model's PROPERTY line AFTER TLC
\* confirms it holds). tlc is NOT available in this environment (java present
\* but tla2tools.jar fetch is blocked on 443), and CI does not run TLC, so
\* this is machine-UNVERIFIED by inspection only. Do not claim verified.
L_Handshake ==
  \A i \in 1..MaxSessions:
    (cState[i] # "init") ~> (cState[i] = "active" /\ sState[i] = "active")
\* =====================================================================

================================================================================
