% function values = apply_perlin(samples, 

tic;

gradients = perlin_gradients( 10, 3, 4 );

samples = [0.02, 0.11, 0.52]';
num_samples = 100;

samples = repmat( samples, 1, num_samples );

noise = perlin_noise( samples, gradients );

toc;

%%  1d

tic;

num_dims = 1;
num_octaves = 3;
num_gradient_points = 15;

gradients = perlin_gradients( num_gradient_points, num_dims, num_octaves );

image_size = 1e3;
image_mat = zeros( 1, image_size );

for i = 1:image_size
  image_mat(i) = perlin_noise( i/image_size, gradients, 0.5 );
end

toc;

hold off;
plot( image_mat );
hold on;
shared_utils.plot.add_horizontal_lines( gca, 0 );
ylim( [-0.5, 0.5] );

%%

tic;

num_dims = 3;
num_octaves = 5;
num_gradient_points = 10;

gradients = perlin_gradients( num_gradient_points, num_dims, num_octaves );

image_size = 100;
image_mat = zeros( image_size );

incr = 1 / image_size;
i_stp = 0;
j_stp = 0;

sample = zeros( 2, 1 );
sample(3) = rand();

for i = 1:image_size
  j_stp = 0;
  
  for j = 1:image_size
    sample(1) = i_stp;
    sample(2) = j_stp;
    
    image_mat(i, j) = perlin_noise( sample, gradients );
    
    j_stp = j_stp + incr;
  end
  
  i_stp = i_stp + incr;
end

toc;

%%
imshow( image_mat, 'InitialMagnification', 'fit', 'DisplayRange', [-1, 1] );