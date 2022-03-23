#!/bin/bash

yarn test:e2e
if [ $? -eq 0 ]
then
  kill -9 $(lsof -t -i:8545)
  kill -9 $(lsof -t -i:5000)
  echo here
  exit 0
else
  kill -9 $(lsof -t -i:8545)
  kill -9 $(lsof -t -i:5000)
  exit 1
fi
