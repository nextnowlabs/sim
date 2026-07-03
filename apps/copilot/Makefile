.PHONY: build run test lint docker-image

IMAGE_NAME ?= sim-copilot
IMAGE_TAG  ?= latest

build:
	go build -o bin/copilot .

run:
	go run .

test:
	go test ./...

lint:
	go vet ./...

docker-image:
	docker build -t $(IMAGE_NAME):$(IMAGE_TAG) .
