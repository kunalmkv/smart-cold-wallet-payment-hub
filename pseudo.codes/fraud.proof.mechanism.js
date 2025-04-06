// Conceptual flow for fraud proofs:
/*
1. Watcher detects invalid batch
2. Submits challenge with cryptographic proof
3. Contract verifies proof using precompiled ZK verifier
4. If valid, rolls back batch and slashes sequencer bond
*/
