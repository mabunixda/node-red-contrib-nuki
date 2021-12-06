

docker:
	docker build --no-cache -t registry.home.nitram.at/node-red:nuki-dev .
docker-push:
	docker push registry.home.nitram.at/node-red:nuki-dev
