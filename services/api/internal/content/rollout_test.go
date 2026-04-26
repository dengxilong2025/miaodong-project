package content

import "testing"

func TestUserBucket_RangeAndStability(t *testing.T) {
	cases := []struct {
		userID string
		want   int
	}{
		{userID: "u1", want: 35},
		{userID: "u2", want: 54},
		{userID: "user-123", want: 3},
		{userID: "", want: 61},
		{userID: "alice", want: 79},
		{userID: "bob", want: 44},
	}

	for _, tc := range cases {
		got := userBucket(tc.userID)
		if got < 0 || got > 99 {
			t.Fatalf("bucket out of range for %q: %d", tc.userID, got)
		}
		if got != tc.want {
			t.Fatalf("bucket mismatch for %q: want %d got %d", tc.userID, tc.want, got)
		}
		// stability check (same input => same output)
		got2 := userBucket(tc.userID)
		if got2 != got {
			t.Fatalf("bucket not stable for %q: %d vs %d", tc.userID, got, got2)
		}
	}
}

