package content

import "hash/fnv"

// userBucket maps a stable user identifier into [0, 99] bucket using FNV-1a 32-bit.
// It is used for percentage rollout decisions (bucket < rolloutPercent).
func userBucket(userID string) int {
	h := fnv.New32a()
	_, _ = h.Write([]byte(userID))
	return int(h.Sum32() % 100)
}

