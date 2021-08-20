

docker:
	docker build --no-cache -t mabunixda/node-red:nuki-dev .
docker-push:
	docker push mabunixda/node-red:nuki-dev
