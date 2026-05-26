.PHONY: build build-native test lint clean

build: build-native
	go build -o bounce ./cmd/bounce

# Force cgo relinking so changes to the native .a files are picked up.
rebuild: build-native
	go build -a -o bounce ./cmd/bounce

build-native:
	$(MAKE) -C native/analysis
	$(MAKE) -C native/engine

test:
	go test ./...

lint:
	go vet ./...

clean:
	rm -f bounce
	$(MAKE) -C native/analysis clean
	$(MAKE) -C native/engine clean
