package content

import (
	"strings"
	"testing"
)

func TestDefaultShareAsset(t *testing.T) {
	a := DefaultShareAsset()

	if a["share_title"] != "测一测我家猫在想啥" {
		t.Fatalf("unexpected share_title: %v", a["share_title"])
	}
	if a["card_style"] != "result_card_v1" {
		t.Fatalf("unexpected card_style: %v", a["card_style"])
	}
	tpl, _ := a["share_text_template"].(string)
	for _, want := range []string{"{label}", "{confidence}", "#喵懂", "#喵测"} {
		if !strings.Contains(tpl, want) {
			t.Fatalf("share template missing %q: %q", want, tpl)
		}
	}
}
