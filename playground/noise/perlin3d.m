function image_mat = perlin3d(gradients, image_size, num_frames, incr, norm01)

if ( nargin < 5 )
  norm01 = true;
end

image_mat = zeros( [image_size, image_size, num_frames] );

parfor k = 1:num_frames
  i_stp = 0;
  k_stp = (k-1) * incr;
  
  for i = 1:image_size
    j_stp = 0;

    for j = 1:image_size
      curr_sample = perlin_noise( [i_stp, j_stp, k_stp]', gradients );      
      image_mat(i, j, k) = curr_sample;
      j_stp = j_stp + incr;
    end

    i_stp = i_stp + incr;
  end
end

if ( norm01 )
  abs_max = max( max(max(image_mat)) );
  abs_min = min( min(min(image_mat)) );
  
  image_mat = (image_mat - abs_min) ./ (abs_max - abs_min);
end

end