for p in ABI-L2-CMIPF ABI-L1b-RadF ABI-L2-MCMIPF; do for h in 11 12 13 14 16 18 20 21; do
  n=$(aws s3 ls --no-sign-request s3://noaa-goes16/$p/2022/256/$h/ | grep -c "C13\|MCMIP"); echo "$p 256/$h $n $(aws s3 ls --no-sign-request s3://noaa-goes16/$p/2022/256/$h/ | grep "C13\|MCMIP" | head -1 | awk '{print $3, $4}')"
done; done
aws s3 ls --no-sign-request s3://noaa-goes16/ABI-L2-CMIPF/2022/256/14/ | head -5
for h in 12 14 16 18 20; do aws s3 ls --no-sign-request s3://noaa-goes18/ABI-L2-CMIPF/2022/256/$h/ | grep C13 | head -1; done
